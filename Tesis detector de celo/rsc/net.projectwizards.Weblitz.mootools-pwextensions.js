
/**
 * A MooTools implementation of an event bus to decouple
 * the event sender from the receiver. It is very similar to 
 * NSNotificationCenter in Cocoa.
 * 
 * MooTools Class.Extras already implements events. This class
 * acts as a tiny wrapper around the Class event system of MooTools
 *
 * @author Anurag Mishra
 * @date 2010/03/03
 *
 */
var EventBus = new Class({
    Implements: Events,

    /**
     * Register observer for the given notification.
     * 
     * @param notification:string Name of the notification
     * @param observer:Object The observing object
     */
    addObserver: function(notification, observer) {
        this.addEvent(notification, observer);
    },

    /**
     * Remove observer for the given notification.
     *
     * @param notification:string Name of the notification
     * @param observer:Object The observing object
     */
    removeObserver: function(notification, observer) {
        this.removeEvent(notification, observer);
    },

    /**
     * Broadcast notification to all registered observers
     *
     * @param notification:string Name of the notification
     */
    postNotification: function(notification, data) {
        this.fireEvent(notification, data);
    }
});


var defaultEventBus = null;
// Returns the eventBus of the window. For the top level window an event bus is directly created.
// For windows belonging to a frame element, the event bus of the frame element is returned.
window.eventBus = function(){
    if(!defaultEventBus)
        defaultEventBus = window == window.top ? new EventBus() : window.frameElement.eventBus;
    return defaultEventBus;
};

(function(window,$,undef){

function pwlog(text)
{
    if(0)   // Disabled by default
    {
        var logArea = $('logArea');
        if(!logArea) {
            logArea = new Element('pre', {id: 'logArea'});
            logArea.inject(document.body);
        }
        logArea.set('text', logArea.get('text') + '\n' + text);
    }
}
 
// Removes all script definitions from the string and returns the result.
// This function takes an optional argument which is a block with the following
// signature: function(scripts, text). The block is called at the end. 
// scripts is an array with HTMLScriptElements created by this function.
String.implement('stripScriptsPW', function(block){
    var scripts = [];
    var text = this.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, function(all, code){
        // Convert "<script>...</script>" into a DOM element:
        var div = new Element('div');
        div.set('html', all);
        scripts.push(div.getElement('script'));
        return ''; // return the replacement text
    });
    if (typeOf(block) == 'function') 
        block(scripts, text);       
    return text;
});

// PWScriptExecuter executes HTMLScriptElements one after another
// assuring that external scripts are only loaded once.
PWScriptExecuter = new Class({

    loadedScriptSources: {},

    initialize: function(){

        // Fill loadedScriptSources with all script sources found in the document
        var loadedScriptSources = this.loadedScriptSources;
        pwlog("scripts on main page:");
        Array.each($$('script'), function(script, index){
            var src = script.src;
            if(src) {
                loadedScriptSources[src] = 1;
                pwlog("\t   "+src);
            }
        }); 
    },
    
    // Note: Only for internal use.
    // Executes the LAST script in scripts and removes it from scripts.
    // Then calls itself with the remaining scripts.
    executeNextScript: function(scripts){
        if(scripts.length == 0)
            return;
        var loadedScriptSources = this.loadedScriptSources;
        var nextScript = scripts.pop();
        var src = nextScript.src;
        if(src) {
            if(!loadedScriptSources.hasOwnProperty(src)){
                pwlog('  loading: '+src);
                loadedScriptSources[src] = 1;
                var scriptExecuter = this;
                Asset.javascript(src, {
                    onLoad: function(){
                        scriptExecuter.executeNextScript(scripts);
                    }
                });
            } else {
                pwlog(' skipping: '+src);
                this.executeNextScript(scripts);
            }
        } else {
            Browser.exec(nextScript.text);
            this.executeNextScript(scripts);
        }
    },

    // Executes scripts in order - one after another.
    // scripts must be HTMLScriptElements
    executeScripts: function(scripts){
        pwlog(""); // Jump to next line
        this.executeNextScript(scripts.reverse());
    }
    
});

// Make sure there is only one script executer per main window.
// Create the script executer after the dome is ready, 
// because it looks for script tags in the loaded document at initialization time. 
window.addEvent('domready', function() {
    if(!window.parent.pwScriptExecuter)
        window.parent.pwScriptExecuter = new PWScriptExecuter();   
});

// Request.HTML.PW is a subclass of Request.HTML. In contrast to Request.HTML it also loads 
// and executes external javascripts.
Request.HTML.PW = new Class({
    Extends: Request.HTML,
    
    initialize: function(options) {    
        this.parent(options);

        // Drain an attached autorelease pool if it is available:
        var updateContainerID = options['update'];
        if(updateContainerID){
            var updateContainer = $(updateContainerID);
            var pool = updateContainer['autoreleasePool'];
            if(pool)
                pool.drain();
        }
    },

    success: function(text){
        var options = this.options, response = this.response;
        
        // Gather all javascript definitions from the response
        // to be executed later.
        response.html = text.stripScriptsPW(function(scripts){
            response.javascripts = scripts;
        });

        var match = response.html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (match) response.html = match[1];
        var temp = new Element('div').set('html', response.html);

        response.tree = temp.childNodes;
        response.elements = temp.getElements(options.filter || '*');

        if (options.filter) response.tree = response.elements;
        if (options.update){
            var update = document.id(options.update).empty();
            if (options.filter) update.adopt(response.elements);
            else update.set('html', response.html);
        } else if (options.append){
            var append = document.id(options.append);
            if (options.filter) response.elements.reverse().inject(append);
            else append.adopt(temp.getChildren());
        }

        // Execute all javascripts
        if (options.evalScripts && response.javascripts)
            window.parent.pwScriptExecuter.executeScripts(response.javascripts)
        
        this.onSuccess(response.tree, response.elements, response.html);
    }

});
 
})(this,document.id);

// Method used by WBLAjaxActionFunction to send their actions to the server
var WBLAjaxActionFunctionRequestHandler = function(event, itemURL, options) {
    var target = event ? event.target : null;
    
    var synchronously     = options && options.synchronously;
    var dontEvalScripts   = options && options.dontEvalScripts;

    // Find the right update container:
    var updateContainerID;
    if(options && options.updateContainerID)
        updateContainerID = options.updateContainerID;
    else if(target){
        // Search for a parent element with the following attribute: data-update-container="true". That is the update container.
        var element = $(target);
        var updateContainer = null;
        do{
            element = element.getParent();
            if(element.getProperty('data-update-container') == 'true')
                updateContainer = element;
        }while (!updateContainer && element);
        if(updateContainer)
            updateContainerID = updateContainer.getProperty('id');
    }

    // Find the right form:
    var form;
    if(options && options.formID)
        form = $(options.formID);
    else if(target)
        form = target.getParent('form');
    
    // The form, the target element lives in, is used:
    var data = '' + Object.toQueryString({'%@':1});
    if(form)
        data += '&' + Element.toQueryString(form);

    if(arguments[0])
        data += '&' + Object.toQueryString(arguments[0]); // What was this for?
    
    if(updateContainerID)
        new Request.HTML.PW({       url:itemURL,
                                 update:updateContainerID,
                            evalScripts:!dontEvalScripts,
                                   data:data}).send();
    else {
        var request = new Request({         url:itemURL,
                                    evalScripts:!dontEvalScripts,
                                           data:data}).send();
        
        // Wait until the response text is sent back:
        if(synchronously)
            request.response.text;
    }
};


window.addEvent('load', function(){
    IframeShim.ready = true;
});


// PWZoomDetector uses polling to detect a zoom level change. This is not very smart, 
// but unfortunately there is no other way to detect it in all browsers (as of 9.5.2012). 
// onZoomChangeCallback is called on every zoom level change event and in options you can set
// your own polling interval (see options->pollInterval).

// TODO: Rewrite this and use the EventBus to post messages on zoom change instead.

PWZoomDetector = new Class({
    Implements: [Options],
    options: {
        // This value is in milliseconds
        pollInterval: 1000,
        zoomDivName: 'zoomDetectionDiv'
    },

    initialize: function(onZoomChangeCallback, options){
        this.setOptions(options);
        this.onZoomChangeCallback = onZoomChangeCallback;
        
        // Add an absolute positioned div with a relative width to the document and hide it.
        // The width is always 100% but in each zoom level this is a different absolute value.
        // We detect a change by polling the width of the div.
        
        var zoomDetectionDiv = $(this.options.zoomDivName);
        if(!zoomDetectionDiv) {
            var body = $(document.body);
            var zoomDetectionDiv = new Element('div', {
                id: this.options.zoomDivName,
                styles: {
                    position:"absolute",
                    width:"100%",
                    height:"0px",
                    visibility:"hidden"
                }
            });
            zoomDetectionDiv.inject(body);
            var width = zoomDetectionDiv.offsetWidth;
            var zoomDidChangeTest = function() {
                var newWidth = zoomDetectionDiv.offsetWidth;
                if(newWidth != width) {
                    width = newWidth;
                    onZoomChangeCallback();
                }
            };
            this.zoomTimerID = zoomDidChangeTest.periodical(this.options.pollInterval);                                            
        }
    },
    
    dispose: function(){
        this.onZoomChangeCallback = null;
        var zoomDetectionDiv = $(this.options.zoomDivName);        
        if(zoomDetectionDiv)
            zoomDetectionDiv.destroy();
        if(this.zoomTimerID)
            clearInterval(this.zoomTimerID);
    }
});

Element.implement({

    // Measures the size of an element it would have with a different inner HTML if innerHTML is given.
    // To do this a copy of the element is created, it is made invisible, the innerHTML is replaced 
    // and then it is attached to the DOM next to the original element. 
    // Then the size is measured before the copy is removed from the DOM.
    // If "debug" is set to true, the copy is visible and wouldn't be removed from the DOM.

    measureSizeWithInnerHTML: function(innerHTML, debug){
        var copy = this.clone(!innerHTML, true);
        if(innerHTML)
            copy.innerHTML = innerHTML;
        copy.setStyle('position', 'absolute');
        if(!debug)
            copy.setStyle('visibility', 'hidden');
        this.getParent().appendChild(copy);
        var size = copy.getSize();
        if(!debug)
            copy.destroy();
        return size;
    },

    // measureTextSize measures the size of a text inside this element.
    // If no text is given, the size of the content of this element (innerHTML) is measured.
    measureTextSizeSpan: null,
    measureTextSize: function(text){
        if(!text)
            text = this.innerHTML;
        if(!this.measureTextSizeSpan)
            this.measureTextSizeSpan = new Element('span');
        var span = this.measureTextSizeSpan;
        span.innerHTML = text;
        span.setStyles({'position':'absolute', 'visibility':'hidden', 'width':'auto', 'white-space':'nowrap'});
        this.appendChild(span);
        var size = span.getSize();
        this.removeChild(span);
        return size;
    }
});

PWStopWatch = new Class({
    initialize: function(start){
        if(start)
            this.start();
    },
        
    // Returns the current time in milliseconds since 1 January 1970 00:00:00 UTC
    getTime: function(){
      return new Date().getTime();
    },
    
    // Starts the stopwatch if not already started and saves the start time in startTime.
    start: function(){  
        if (!this.running){
            this.stopTime = null;       
            this.intervalTime = null;
            this.running = true;    
            this.startTime = this.getTime();
        }   
    },

    // Stops the stopwatch if running and saves the stop time in stopTime.  
    stop: function(){ 
        if (this.running) {
            this.stopTime = this.getTime();
            this.running = false;
        }
    },

    reset: function(){
        this.stop();
        this.start();
    },
    
    // If startTime is defined, returns the duration between start time and end time.
    // Otherwise returns 'Undefined'.
    duration_: function(startTime, endTime){
        if(startTime == null)
           return 'Undefined';
        return (endTime - startTime) / 1000;
    },
    
    // Gives the time in seconds from  start to now or stop time.
    duration: function(){ 
        return  this.duration_(this.startTime, this.stopTime ? this.stopTime : this.getTime());
    },

    // Gives the time in seconds from the last call to intervalDuration or start to now.    
    intervalDuration: function(){
        var startTime = this.intervalTime ? this.intervalTime : this.startTime;
        var endTime = this.getTime();
        this.intervalTime = endTime;
        return this.duration_(startTime, endTime);
    },
    
    logIntervalDuration: function(msg){
        console.log(msg+": "+this.intervalDuration()+" seconds");
    },

    logDuration: function(msg){
        console.log(msg+": "+this.duration()+" seconds");
    }

});


// The load event of an iframe is not fired at the same time in every browser.
// This method is reliable and works in all browsers. In order to make it work,
// The property "frameIsLoaded" of the iframes element has to be set to true.
// In addition the iframe must post a "iFrameDidLoad" notification to the eventBus of the iFrame.
// ID can be used to debug this stuff.
function PWWaitUntilIFrameIsLoaded(iframe, callback, ID){
	var frameWindow = iframe.contentWindow;
    if(frameWindow && frameWindow['frameIsLoaded']){
        callback();
    } else {
        iframe.eventBus.addObserver('iFrameDidLoad', function(){
            callback();
        });
    }
}

// ID can be used to debug this stuff.
function PWWaitUntilIFramesAreLoaded(iFrames, callback, ID){
    var count = 0;
    
    // Do not directly use the length property because the array can contain a nil iframe item.
    // (is this a bug in mootools?)
    iFrames.each(function(iFrame){
        count++;
    });
    
    iFrames.each(function(iFrame){
        PWWaitUntilIFrameIsLoaded(iFrame, function(){
            count--;
            if(count == 0)
                callback();
        }, ID);
    });
}

// DEBUG helper
function createUniqueID(){	
	if(!window.PWUniqueID)
		window.PWUniqueID = 0;
	window.PWUniqueID++;
	return 'ID-'+window.PWUniqueID;
}

function PWWaitUntilDomIsReadyAndIFramesAreLoaded(window, callback){
	function waitForIFramesIfNeeded(){		
        // If we use iFrames, we have to wait until they are fully loaded.
         var iFrames = $$("iframe");
         var iFrameCount = iFrames.length;
         if(iFrameCount > 0) {
             PWWaitUntilIFramesAreLoaded(iFrames, function(){
                 callback();
             });
         }
         else // Otherwise we directly call the callback:
             callback();
	}

	if(window.document.readyState == "complete")
		waitForIFramesIfNeeded();
	else
    	window.addEvent("domready", function(){
			waitForIFramesIfNeeded();
    });
}

// TODO: test and integrate into other PWWait... methods
function PWWaitForImagesInDocument(aDocument, callback) {
     var images = aDocument.getElementsByTagName("img");
     var count  = images.length;

     function singleImageLoaded(){
        count--;
        if(count == 0)
            callback();
     };

     for (var i = 0; i < images.length; i++) { 
        var image = images[i];
        if(image.complete)
            singleImageLoaded();
        else
            image.addEvent('load', function(){
                singleImageLoaded();
            });
     }
}


function PWIsWebkit(){
    return 'WebkitAppearance' in document.documentElement.style;
}

function PWIEVersion(){
    var iev=0;
    var ieold = (/MSIE (\d+\.\d+);/.test(navigator.userAgent));
    var trident = !!navigator.userAgent.match(/Trident\/7.0/);
    var rv=navigator.userAgent.indexOf("rv:11.0");
    
    if (ieold) iev=new Number(RegExp.$1);
    if (navigator.appVersion.indexOf("MSIE 10") != -1) iev=10;
    if (trident&&rv!=-1) iev=11;
    
    return iev;
}

/*
---

script: Base64.js

description: String methods for encoding and decoding Base64 data

license: MIT-style license.

authors: Ryan Florence (http://ryanflorence.com), webtoolkit.info

requires:
 - core:1.2.4: [String]

provides: [String.toBase64, String.decodeBase64]

...
*/


(function(){

        // Base64 string methods taken from http://www.webtoolkit.info/
        var Base64 = {

            _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

            encode : function (input) {
                var output = "";
                var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
                var i = 0;
                input = Base64._utf8_encode(input);
                while (i < input.length) {
                    chr1 = input.charCodeAt(i++);
                    chr2 = input.charCodeAt(i++);
                    chr3 = input.charCodeAt(i++);
                    enc1 = chr1 >> 2;
                    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                    enc4 = chr3 & 63;
                    if (isNaN(chr2)) {
                        enc3 = enc4 = 64;
                    } else if (isNaN(chr3)) {
                        enc4 = 64;
                    };
                    output = output +
                    this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                        this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
                };
                return output;
            },

            decode : function (input) {
                var output = "";
                var chr1, chr2, chr3;
                var enc1, enc2, enc3, enc4;
                var i = 0;
                input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
                while (i < input.length) {
                    enc1 = this._keyStr.indexOf(input.charAt(i++));
                    enc2 = this._keyStr.indexOf(input.charAt(i++));
                    enc3 = this._keyStr.indexOf(input.charAt(i++));
                    enc4 = this._keyStr.indexOf(input.charAt(i++));
                    chr1 = (enc1 << 2) | (enc2 >> 4);
                    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                    chr3 = ((enc3 & 3) << 6) | enc4;
                    output = output + String.fromCharCode(chr1);
                    if (enc3 != 64) {
                        output = output + String.fromCharCode(chr2);
                    };
                    if (enc4 != 64) {
                        output = output + String.fromCharCode(chr3);
                    };
                };
                output = Base64._utf8_decode(output);
                return output;
            },

            // private method for UTF-8 encoding
            _utf8_encode : function (string) {
                string = string.replace(/\r\n/g,"\n");
                var utftext = "";
                for (var n = 0; n < string.length; n++) {
                var c = string.charCodeAt(n);
                if (c < 128) {
                    utftext += String.fromCharCode(c);
                } else if((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                }   else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                };

            };
            return utftext;
            },


        _utf8_decode : function (utftext) {
            var string = "";
            var i = 0;
            var c = c1 = c2 = 0;
            while ( i < utftext.length ) {
                c = utftext.charCodeAt(i);
                if (c < 128) {
                    string += String.fromCharCode(c);
                    i++;
                }   else if((c > 191) && (c < 224)) {
                    c2 = utftext.charCodeAt(i+1);
                    string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                    i += 2;
                }   else {
                    c2 = utftext.charCodeAt(i+1);
                    c3 = utftext.charCodeAt(i+2);
                    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                    i += 3;
                };
            };
            return string;
        }

    };
    
    String.implement({
        toBase64: function(){
            return Base64.encode(this);
        },

        decodeBase64: function(){
            return Base64.decode(this);
        }
    });

})();


function getCSSRule(ruleName, deleteFlag) {               // Return requested style obejct
    ruleName=ruleName.toLowerCase();                       // Convert test string to lower case.
    if (document.styleSheets) {                            // If browser can play with stylesheets
        for (var i=0; i<document.styleSheets.length; i++) { // For each stylesheet
            var styleSheet=document.styleSheets[i];          // Get the current Stylesheet
            var ii=0;                                        // Initialize subCounter.
            var cssRule=false;                               // Initialize cssRule.
            do {                                             // For each rule in stylesheet
                if (styleSheet.cssRules) {                    // Browser uses cssRules?
                    cssRule = styleSheet.cssRules[ii];         // Yes --Mozilla Style
                } else {                                      // Browser usses rules?
                    cssRule = styleSheet.rules[ii];            // Yes IE style.
                }                                             // End IE check.
                if (cssRule)  {                               // If we found a rule...
                    if (cssRule.selectorText.toLowerCase()==ruleName) { //  match ruleName?
                        if (deleteFlag=='delete') {             // Yes.  Are we deleteing?
                            if (styleSheet.cssRules) {           // Yes, deleting...
                                styleSheet.deleteRule(ii);        // Delete rule, Moz Style
                            } else {                             // Still deleting.
                                styleSheet.removeRule(ii);        // Delete rule IE style.
                            }                                    // End IE check.
                            return true;                         // return true, class deleted.
                        } else {                                // found and not deleting.
                            return cssRule;                      // return the style object.
                        }                                       // End delete Check
                    }                                          // End found rule name
                }                                             // end found cssRule
                ii++;                                         // Increment sub-counter
            } while (cssRule)                                // end While loop
                }                                                   // end For loop
    }                                                      // end styleSheet ability check
    return false;                                          // we found NOTHING!
}                                                         // end getCSSRule

function killCSSRule(ruleName) {                          // Delete a CSS rule
    return getCSSRule(ruleName,'delete');                  // just call getCSSRule w/delete flag.
}                                                         // end killCSSRule

function addCSSRule(ruleName) {                           // Create a new css rule
    if (document.styleSheets) {                            // Can browser do styleSheets?
        if (!getCSSRule(ruleName)) {                        // if rule doesn't exist...
            if (document.styleSheets[0].addRule) {           // Browser is IE?
                document.styleSheets[0].addRule(ruleName, null,0);      // Yes, add IE style
            } else {                                         // Browser is IE?
                document.styleSheets[0].insertRule(ruleName+' { }', 0); // Yes, add Moz style.
            }                                                // End browser check
        }                                                   // End already exist check.
    }                                                      // End browser ability check.
    return getCSSRule(ruleName);                           // return rule we just created.
}

/**
 * Copyright (c) 2011-2014 Felix Gnass
 * Licensed under the MIT license
 */
(function(root, factory) {

  /* CommonJS */
  if (typeof exports == 'object')  module.exports = factory()

  /* AMD module */
  else if (typeof define == 'function' && define.amd) define(factory)

  /* Browser global */
  else root.Spinner = factory()
}
(this, function() {
  "use strict";

  var prefixes = ['webkit', 'Moz', 'ms', 'O'] /* Vendor prefixes */
    , animations = {} /* Animation rules keyed by their name */
    , useCssAnimations /* Whether to use CSS animations or setTimeout */

  /**
   * Utility function to create elements. If no tag name is given,
   * a DIV is created. Optionally properties can be passed.
   */
  function createEl(tag, prop) {
    var el = document.createElement(tag || 'div')
      , n

    for(n in prop) el[n] = prop[n]
    return el
  }

  /**
   * Appends children and returns the parent.
   */
  function ins(parent /* child1, child2, ...*/) {
    for (var i=1, n=arguments.length; i<n; i++)
      parent.appendChild(arguments[i])

    return parent
  }

  /**
   * Insert a new stylesheet to hold the @keyframe or VML rules.
   */
  var sheet = (function() {
    var el = createEl('style', {type : 'text/css'})
    ins(document.getElementsByTagName('head')[0], el)
    return el.sheet || el.styleSheet
  }())

  /**
   * Creates an opacity keyframe animation rule and returns its name.
   * Since most mobile Webkits have timing issues with animation-delay,
   * we create separate rules for each line/segment.
   */
  function addAnimation(alpha, trail, i, lines) {
    var name = ['opacity', trail, ~~(alpha*100), i, lines].join('-')
      , start = 0.01 + i/lines * 100
      , z = Math.max(1 - (1-alpha) / trail * (100-start), alpha)
      , prefix = useCssAnimations.substring(0, useCssAnimations.indexOf('Animation')).toLowerCase()
      , pre = prefix && '-' + prefix + '-' || ''

    if (!animations[name]) {
      sheet.insertRule(
        '@' + pre + 'keyframes ' + name + '{' +
        '0%{opacity:' + z + '}' +
        start + '%{opacity:' + alpha + '}' +
        (start+0.01) + '%{opacity:1}' +
        (start+trail) % 100 + '%{opacity:' + alpha + '}' +
        '100%{opacity:' + z + '}' +
        '}', sheet.cssRules.length)

      animations[name] = 1
    }

    return name
  }

  /**
   * Tries various vendor prefixes and returns the first supported property.
   */
  function vendor(el, prop) {
    var s = el.style
      , pp
      , i

    prop = prop.charAt(0).toUpperCase() + prop.slice(1)
    for(i=0; i<prefixes.length; i++) {
      pp = prefixes[i]+prop
      if(s[pp] !== undefined) return pp
    }
    if(s[prop] !== undefined) return prop
  }

  /**
   * Sets multiple style properties at once.
   */
  function css(el, prop) {
    for (var n in prop)
      el.style[vendor(el, n)||n] = prop[n]

    return el
  }

  /**
   * Fills in default values.
   */
  function merge(obj) {
    for (var i=1; i < arguments.length; i++) {
      var def = arguments[i]
      for (var n in def)
        if (obj[n] === undefined) obj[n] = def[n]
    }
    return obj
  }

  /**
   * Returns the absolute page-offset of the given element.
   */
  function pos(el) {
    var o = { x:el.offsetLeft, y:el.offsetTop }
    while((el = el.offsetParent))
      o.x+=el.offsetLeft, o.y+=el.offsetTop

    return o
  }

  /**
   * Returns the line color from the given string or array.
   */
  function getColor(color, idx) {
    return typeof color == 'string' ? color : color[idx % color.length]
  }

  // Built-in defaults

  var defaults = {
    lines: 12,            // The number of lines to draw
    length: 7,            // The length of each line
    width: 5,             // The line thickness
    radius: 10,           // The radius of the inner circle
    rotate: 0,            // Rotation offset
    corners: 1,           // Roundness (0..1)
    color: '#000',        // #rgb or #rrggbb
    direction: 1,         // 1: clockwise, -1: counterclockwise
    speed: 1,             // Rounds per second
    trail: 100,           // Afterglow percentage
    opacity: 1/4,         // Opacity of the lines
    fps: 20,              // Frames per second when using setTimeout()
    zIndex: 2e9,          // Use a high z-index by default
    className: 'spinner', // CSS class to assign to the element
    top: '50%',           // center vertically
    left: '50%',          // center horizontally
    position: 'absolute'  // element position
  }

  /** The constructor */
  function Spinner(o) {
    this.opts = merge(o || {}, Spinner.defaults, defaults)
  }

  // Global defaults that override the built-ins:
  Spinner.defaults = {}

  merge(Spinner.prototype, {

    /**
     * Adds the spinner to the given target element. If this instance is already
     * spinning, it is automatically removed from its previous target b calling
     * stop() internally.
     */
    spin: function(target) {
      this.stop()

      var self = this
        , o = self.opts
        , el = self.el = css(createEl(0, {className: o.className}), {position: o.position, width: 0, zIndex: o.zIndex})
        , mid = o.radius+o.length+o.width

      css(el, {
        left: o.left,
        top: o.top
      })
        
      if (target) {
        target.insertBefore(el, target.firstChild||null)
      }

      el.setAttribute('role', 'progressbar')
      self.lines(el, self.opts)

      if (!useCssAnimations) {
        // No CSS animation support, use setTimeout() instead
        var i = 0
          , start = (o.lines - 1) * (1 - o.direction) / 2
          , alpha
          , fps = o.fps
          , f = fps/o.speed
          , ostep = (1-o.opacity) / (f*o.trail / 100)
          , astep = f/o.lines

        ;(function anim() {
          i++;
          for (var j = 0; j < o.lines; j++) {
            alpha = Math.max(1 - (i + (o.lines - j) * astep) % f * ostep, o.opacity)

            self.opacity(el, j * o.direction + start, alpha, o)
          }
          self.timeout = self.el && setTimeout(anim, ~~(1000/fps))
        })()
      }
      return self
    },

    /**
     * Stops and removes the Spinner.
     */
    stop: function() {
      var el = this.el
      if (el) {
        clearTimeout(this.timeout)
        if (el.parentNode) el.parentNode.removeChild(el)
        this.el = undefined
      }
      return this
    },

    /**
     * Internal method that draws the individual lines. Will be overwritten
     * in VML fallback mode below.
     */
    lines: function(el, o) {
      var i = 0
        , start = (o.lines - 1) * (1 - o.direction) / 2
        , seg

      function fill(color, shadow) {
        return css(createEl(), {
          position: 'absolute',
          width: (o.length+o.width) + 'px',
          height: o.width + 'px',
          background: color,
          boxShadow: shadow,
          transformOrigin: 'left',
          transform: 'rotate(' + ~~(360/o.lines*i+o.rotate) + 'deg) translate(' + o.radius+'px' +',0)',
          borderRadius: (o.corners * o.width>>1) + 'px'
        })
      }

      for (; i < o.lines; i++) {
        seg = css(createEl(), {
          position: 'absolute',
          top: 1+~(o.width/2) + 'px',
          transform: o.hwaccel ? 'translate3d(0,0,0)' : '',
          opacity: o.opacity,
          animation: useCssAnimations && addAnimation(o.opacity, o.trail, start + i * o.direction, o.lines) + ' ' + 1/o.speed + 's linear infinite'
        })

        if (o.shadow) ins(seg, css(fill('#000', '0 0 4px ' + '#000'), {top: 2+'px'}))
        ins(el, ins(seg, fill(getColor(o.color, i), '0 0 1px rgba(0,0,0,.1)')))
      }
      return el
    },

    /**
     * Internal method that adjusts the opacity of a single line.
     * Will be overwritten in VML fallback mode below.
     */
    opacity: function(el, i, val) {
      if (i < el.childNodes.length) el.childNodes[i].style.opacity = val
    }

  })


  function initVML() {

    /* Utility function to create a VML tag */
    function vml(tag, attr) {
      return createEl('<' + tag + ' xmlns="urn:schemas-microsoft.com:vml" class="spin-vml">', attr)
    }

    // No CSS transforms but VML support, add a CSS rule for VML elements:
    sheet.addRule('.spin-vml', 'behavior:url(#default#VML)')

    Spinner.prototype.lines = function(el, o) {
      var r = o.length+o.width
        , s = 2*r

      function grp() {
        return css(
          vml('group', {
            coordsize: s + ' ' + s,
            coordorigin: -r + ' ' + -r
          }),
          { width: s, height: s }
        )
      }

      var margin = -(o.width+o.length)*2 + 'px'
        , g = css(grp(), {position: 'absolute', top: margin, left: margin})
        , i

      function seg(i, dx, filter) {
        ins(g,
          ins(css(grp(), {rotation: 360 / o.lines * i + 'deg', left: ~~dx}),
            ins(css(vml('roundrect', {arcsize: o.corners}), {
                width: r,
                height: o.width,
                left: o.radius,
                top: -o.width>>1,
                filter: filter
              }),
              vml('fill', {color: getColor(o.color, i), opacity: o.opacity}),
              vml('stroke', {opacity: 0}) // transparent stroke to fix color bleeding upon opacity change
            )
          )
        )
      }

      if (o.shadow)
        for (i = 1; i <= o.lines; i++)
          seg(i, -2, 'progid:DXImageTransform.Microsoft.Blur(pixelradius=2,makeshadow=1,shadowopacity=.3)')

      for (i = 1; i <= o.lines; i++) seg(i)
      return ins(el, g)
    }

    Spinner.prototype.opacity = function(el, i, val, o) {
      var c = el.firstChild
      o = o.shadow && o.lines || 0
      if (c && i+o < c.childNodes.length) {
        c = c.childNodes[i+o]; c = c && c.firstChild; c = c && c.firstChild
        if (c) c.opacity = val
      }
    }
  }

  var probe = css(createEl('group'), {behavior: 'url(#default#VML)'})

  if (!vendor(probe, 'transform') && probe.adj) initVML()
  else useCssAnimations = vendor(probe, 'animation')

  return Spinner

}));


// TEST TEST TEST TEST TEST BELOW

/*
 * Josh Hundley 
 * http://flightofthought.com
 */

/**
 * SortedList : constructor
 */

function SortedList() {
    var arr = null,
        options = {},
        args = arguments;

    ["0", "1"].forEach(function(n) {
        var val = args[n];
        if (Array.isArray(val)) {
            arr = val;
        }
        else if (val && typeof val == "object") {
            options = val;
        }
    });

    if (typeof options.filter == 'function') {
        this._filter = options.filter;
    }

    if (typeof options.compare == 'function') {
        this._compare = options.compare;
    }
    else if (typeof options.compare == 'string' && SortedList.compares[options.compare]) {
        this._compare = SortedList.compares[options.compare];
    }

    this._unique = !! options.unique;

    if (options.resume && arr) {
        arr.sort(this._compare).forEach(function(v, i) {
            this.push(v)
        }, this);
    }
    else if (arr) this.insert.apply(this, arr);
};

/**
 * SortedList.create(val1, val2)
 * creates an instance
 **/
SortedList.create = function(val1, val2) {
    return new SortedList(val1, val2);
};


SortedList.prototype = new Array();
SortedList.prototype.constructor = Array.prototype.constructor;

/**
 * sorted.insertOne(val)
 * insert one value
 * returns false if failed, inserted position if succeed
 **/
SortedList.prototype.insertOne = function(val) {
    var pos = this.bsearch(val);
    if (this._unique && this.key(val, pos) != null) return false;
    if (!this._filter(val, pos)) return false;
    this.splice(pos + 1, 0, val);
    return pos + 1;
};

/**
 * sorted.insert(val1, val2, ...)
 * insert multi values
 * returns the list of the results of insertOne()
 **/
SortedList.prototype.insert = function() {
    return Array.prototype.map.call(arguments, function(val) {
        return this.insertOne(val);
    }, this);
};

/**
 * sorted.remove(pos)
 * remove the value in the given position
 **/
SortedList.prototype.remove = function(pos) {
    this.splice(pos, 1);
    return this;
}

/**
 * sorted.bsearch(val)
 * @returns position of the value
 **/
SortedList.prototype.bsearch = function(val) {
    if (!this.length) return -1;
    var mpos, spos = 0,
        epos = this.length;
    while (epos - spos > 1) {
        mpos = Math.floor((spos + epos) / 2);
        mval = this[mpos];
        var comp = this._compare(val, mval);
        if (comp == 0) return mpos;
        if (comp > 0) spos = mpos;
        else epos = mpos;
    }
    return (spos == 0 && this._compare(this[0], val) > 0) ? -1 : spos;
};

/**
 * sorted.key(val)
 * @returns first index if exists, null if not
 **/
SortedList.prototype.key = function(val, bsResult) {
    if (bsResult == null) bsResult = this.bsearch(val);
    var pos = bsResult;
    if (pos == -1 || this._compare(this[pos], val) < 0) return (pos + 1 < this.length && this._compare(this[pos + 1], val) == 0) ? pos + 1 : null;
    while (pos >= 1 && this._compare(this[pos - 1], val) == 0) pos--;
    return pos;
};

/**
 * sorted.key(val)
 * @returns indexes if exists, null if not
 **/
SortedList.prototype.keys = function(val, bsResult) {
    var ret = [];
    if (bsResult == null) bsResult = this.bsearch(val);
    var pos = bsResult;
    while (pos >= 0 && this._compare(this[pos], val) == 0) {
        ret.push(pos);
        pos--;
    }

    var len = this.length;
    pos = bsResult + 1;
    while (pos < len && this._compare(this[pos], val) == 0) {
        ret.push(pos);
        pos++;
    }
    return ret.length ? ret : null;
};

/**
 * sorted.unique()
 * @param createNew : create new instance
 * @returns first index if exists, null if not
 **/
SortedList.prototype.unique = function(createNew) {
    if (createNew) return this.filter(function(v, k) {
        return k == 0 || this._compare(this[k - 1], v) != 0;
    }, this);
    var total = 0;
    this.map(function(v, k) {
        if (k == 0 || this._compare(this[k - 1], v) != 0) return null;
        return k - (total++);
    }, this).forEach(function(k) {
        if (k != null) this.remove(k);
    }, this)
    return this;
};

/**
 * sorted.toArray()
 * get raw array
 **/
SortedList.prototype.toArray = function() {
    return this.slice();
};


/**
 * default filtration function
 **/
SortedList.prototype._filter = function(val, pos) {
    return true;
};


/**
 * comparison functions 
 **/
SortedList.compares = {
    "number": function(a, b) {
        var c = a - b;
        return (c > 0) ? 1 : (c == 0) ? 0 : -1;
    },

    "string": function(a, b) {
        return (a > b) ? 1 : (a == b) ? 0 : -1;
    }
};


/**
 * IntervalTree
 *
 * @param (object) data:
 * @param (number) center:
 * @param (object) options:
 *   center:
 *
 **/

function IntervalTree(center, options) {
    options || (options = {});

    this.startKey = options.startKey || 0; // start key
    this.endKey = options.endKey || 1; // end key
    this.intervalHash = {}; // id => interval object
    this.pointTree = new SortedList({ // b-tree of start, end points 
        compare: function(a, b) {
            if (a == null) return -1;
            if (b == null) return 1;
            var c = a[0] - b[0];
            return (c > 0) ? 1 : (c == 0) ? 0 : -1;
        }
    });

    this._autoIncrement = 0;

    // index of the root node
    if (!center || typeof center != 'number') {
        throw new Error('you must specify center index as the 2nd argument.');
    }

    this.root = new Node(center, this);
}


/**
 * publid methods
 **/


/**
 * add new range
 **/
IntervalTree.prototype.add = function(data, id) {
    if (this.intervalHash[id]) {
        throw new Error('id ' + id + ' is already registered.');
    }

    if (id == undefined) {
        while (this.intervalHash[this._autoIncrement]) {
            this._autoIncrement++;
        }
        id = this._autoIncrement;
    }

    var itvl = new Interval(data, id, this.startKey, this.endKey);
    this.pointTree.insert([itvl.start, id]);
    this.pointTree.insert([itvl.end, id]);
    this.intervalHash[id] = itvl;
    this._autoIncrement++;
    _insert.call(this, this.root, itvl);
};


/**
 * search
 *
 * @param (integer) val:
 * @return (array)
 **/
IntervalTree.prototype.search = function(val1, val2) {
    var ret = [];
    if (typeof val1 != 'number') {
        throw new Error(val1 + ': invalid input');
    }

    if (val2 == undefined) {
        _pointSearch.call(this, this.root, val1, ret);
    }
    else if (typeof val2 == 'number') {
        _rangeSearch.call(this, val1, val2, ret);
    }
    else {
        throw new Error(val1 + ',' + val2 + ': invalid input');
    }
    return ret;
};


/**
 * remove: 
 **/
IntervalTree.prototype.remove = function(interval_id) {};



/**
 * private methods
 **/


/**
 * _insert
 **/

function _insert(node, itvl) {
    if (itvl.end < node.idx) {
        if (!node.left) {
            node.left = new Node(itvl.start + itvl.end >>> 1, this);
        }
        return _insert.call(this, node.left, itvl);
    }

    if (node.idx < itvl.start) {
        if (!node.right) {
            node.right = new Node(itvl.start + itvl.end >>> 1, this);
        }
        return _insert.call(this, node.right, itvl);
    }
    return node.insert(itvl);
}


/**
 * _pointSearch
 * @param (Node) node
 * @param (integer) idx 
 * @param (Array) arr
 **/

function _pointSearch(node, idx, arr) {
    if (!node) return;

    if (idx < node.idx) {

        node.starts.every(function(itvl) {
            var bool = (itvl.start <= idx);
            if (bool) arr.push(itvl.result());
            return bool;
        });
        return _pointSearch.call(this, node.left, idx, arr);
    }

    else if (idx > node.idx) {

        node.ends.every(function(itvl) {
            var bool = (itvl.end >= idx);
            if (bool) arr.push(itvl.result());
            return bool;
        });
        return _pointSearch.call(this, node.right, idx, arr);
    }
    // exact equal
    else {
        node.starts.map(function(itvl) {
            arr.push(itvl.result())
        });
    }
}



/**
 * _rangeSearch
 * @param (integer) start
 * @param (integer) end
 * @param (Array) arr
 **/

function _rangeSearch(start, end, arr) {
    if (end - start <= 0) {
        throw new Error('end must be greater than start. start: ' + start + ', end: ' + end);
    }
    var resultHash = {};

    var wholeWraps = [];
    _pointSearch.call(this, this.root, (start + end) >>> 1, wholeWraps, true);

    wholeWraps.forEach(function(result) {
        resultHash[result.id] = true;
    });


    var idx1 = this.pointTree.bsearch([start, null]);
    while (idx1 >= 0 && this.pointTree[idx1][0] == start) {
        idx1--;
    }

    var idx2 = this.pointTree.bsearch([end, null]);
    var len = this.pointTree.length - 1;
    while (idx2 <= len && this.pointTree[idx2][0] <= end) {
        idx2++;
    }

    this.pointTree.slice(idx1 + 1, idx2).forEach(function(point) {
        var id = point[1];
        resultHash[id] = true;
    }, this);

    Object.keys(resultHash).forEach(function(id) {
        var itvl = this.intervalHash[id];
        arr.push(itvl.result(start, end));
    }, this);

}



/**
 * subclasses
 * 
 **/


/**
 * Node : prototype of each node in a interval tree
 * 
 **/

function Node(idx) {
    this.idx = idx;
    this.starts = new SortedList({
        compare: function(a, b) {
            if (a == null) return -1;
            if (b == null) return 1;
            var c = a.start - b.start;
            return (c > 0) ? 1 : (c == 0) ? 0 : -1;
        }
    });

    this.ends = new SortedList({
        compare: function(a, b) {
            if (a == null) return -1;
            if (b == null) return 1;
            var c = a.end - b.end;
            return (c < 0) ? 1 : (c == 0) ? 0 : -1;
        }
    });
};

/**
 * insert an Interval object to this node
 **/
Node.prototype.insert = function(interval) {
    this.starts.insert(interval);
    this.ends.insert(interval);
};



/**
 * Interval : prototype of interval info
 **/

function Interval(data, id, s, e) {
    this.id = id;
    this.start = data[s];
    this.end = data[e];
    this.data = data;

    if (typeof this.start != 'number' || typeof this.end != 'number') {
        throw new Error('start, end must be number. start: ' + this.start + ', end: ' + this.end);
    }

    if (this.start >= this.end) {
        throw new Error('start must be smaller than end. start: ' + this.start + ', end: ' + this.end);
    }
}

/**
 * get result object
 **/
Interval.prototype.result = function(start, end) {
    var ret = {
        id: this.id,
        data: this.data
    };
    if (typeof start == 'number' && typeof end == 'number') {
        /**
         * calc overlapping rate
         **/
        var left = Math.max(this.start, start);
        var right = Math.min(this.end, end);
        var lapLn = right - left;
        ret.rate1 = lapLn / (end - start);
        ret.rate2 = lapLn / (this.end - this.start);
    }
    return ret;
};


    
// PWAutorelasePool can be used to collect objects and for disposing them later all at once.
// In Weblitz an PWAutoreleasePool is attached to every WBLAjaxUpdateContainer. 
// On every update the pool is drained and dispose is called on every registered object.
var PWAutoreleasePool = new Class({
    
    initialize: function(updateContainer){
        this.updateContainer = updateContainer;
//        console.log('PWAutoreleasePool initialize');
    },
    
    addObject: function(object){
        if(!this.objects)
            this.objects = new Array();
        this.objects.include(object);
    },
    
    removeObject: function(object){
        if(this.objects)
            this.objects.erase(object);
    },
    
    drain: function(){        
//        console.log('PWAutoreleasePool drain');
        
        // Drain our own objects
        if(this.objects) {
            this.objects.each(function(object){
                if(typeof object['dispose'] === 'function')    
                    object.dispose();
            }, this);
            this.objects.empty;
        }
        
        // Drain objects from sub autorelease pools:
        if(this.updateContainer)
            this.updateContainer.getElements('[data-update-container]').each(function(updateContainer){
                var pool = updateContainer['autoreleasePool'];
                if(pool)
                    pool.drain();
            }, this);
    }
});

// The class method PWAutoreleasePool.poolForElement(elem) automatically finds a proper autorelease pool for the given element.
// If no WBLAjaxUpdateContainer is found it returns the global autorelease pool which is attached to the window.
PWAutoreleasePool.poolForElement = function(element){
    var updateContainer = element.getParent('[data-update-container]')
    
    // If there is no updateContainer and we are inside an iFrame,
    // search inside the parent document:
    if(!updateContainer){
        var frame = window.frameElement;
        if(frame)
            updateContainer = frame.getParent('[data-update-container]');
    }
    
    if(!updateContainer){
        // TODO: The global autorelease pool is never drained but can be used to hold objects in one place.
        if(!window.autoreleasePool)
            window.autoreleasePool = new PWAutoreleasePool();        
//        console.log('use window autorelease pool!!!');
        return window.autoreleasePool;
    }
    
    if(updateContainer && !updateContainer.autoreleasePool)
        updateContainer.autoreleasePool = new PWAutoreleasePool(updateContainer);
    
    return updateContainer.autoreleasePool;
};

// Adds the given object to the first parent which is an update container and has an autorelease pool.
PWAutoreleasePool.addObjectToPoolForElement = function(object, element){
    PWAutoreleasePool.poolForElement(element).addObject(object);
};


/*
---
 
name: Stylesheet
description: js stylesheet
license: MIT-Style License (http://mifjs.net/license.txt)
copyright: Anton Samoylov (http://mifjs.net)
authors: Anton Samoylov (http://mifjs.net)
requires: core:1.2.4:*
provides: Stylesheet
 
...
*/


var Stylesheet = new Class({
	
	version: '0.9',
 
	initialize: function(){
		this.createSheet();
		this.rules = {};
		this.styles = {};
		this.index = [];
		this.temp = new Element('div');
	},
 
	createSheet: function(){
		var style = new Element('style').inject(document.head);
		this.sheet = style.styleSheet || style.sheet;
	},
 
	addRule: function(selector, styles){
		selector = selector.trim();
		if(selector.contains(',')){
			var selectors = selector.split(',');
			selectors.each(function(selector){
				this.addRule(selector, styles);
			}, this);
			return this;
		}
		var styles = (typeOf(styles) == 'string') ? styles : this.stylesToString(styles);
		if(!styles) return;
		var sheet = this.sheet;
		if(sheet.addRule){
			sheet.addRule(selector, styles);   
		}else{
			sheet.insertRule(selector+'{'+styles+'}', sheet.cssRules.length);
		}
		var rules = this.getRules();
		this.rules[selector] = rules.getLast();
		this.styles[selector] = styles;
		this.index.push(selector);
		return this;
	},
 
	addRules: function(rules){
		for(selector in rules){
			this.addRule(selector, rules[selector]);
		}
		return this;
	},
 
	stylesToString: function(styles){
		this.temp.setStyles(styles);
		var string = this.temp.style.cssText;
		this.temp.style.cssText = '';
		return string;
	},
 
	removeRule: function(index){
		var sheet = this.sheet;
		if(typeOf(index) == 'string'){
			var selector = index.trim();
			if(selector.contains(',')){
				var selectors = selector.split(',');
				selectors.each(function(selector){
					this.removeRule(selector);
				}, this);
				return this;
			}
			var index = this.getRules().indexOf(this.getRule(selector));
			if(index < 0) return this;
		}
		sheet.removeRule ? sheet.removeRule(index) : sheet.deleteRule(index);
		var selector = this.index[index];
		this.index.erase(selector);
		delete this.rules[selector];
		delete this.styles[selector];
		return this;
	},
 
	getRule: function(selector){
		return typeOf(selector) == 'string' ? this.rules[selector] : this.getRules()[selector];
	},
 
	getRules: function(){
		return Array.from(this.sheet.cssRules || this.sheet.rules);
	}
	
});

