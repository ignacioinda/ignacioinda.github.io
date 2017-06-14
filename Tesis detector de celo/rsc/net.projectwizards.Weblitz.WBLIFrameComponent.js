// This method loads all Javascript files used in the parent window also into the frame window.
// This is done synchronously. Therefore all scripts can be used immediately.
// Call this method from within a script tag within the frames head section.
function includeJavascriptFilesUsedInParentWindow() {
    
//    console.log('includeJavascriptFilesUsedInParentWindow');
    
    function loadScriptSynchronously(src) {
        document.writeln("<script type='text/javascript' src='"+src+"'></script>");
    }
    
    function scriptSourcesFromWindow(win) {
        var scripts = win.document.getElementsByTagName('script');
        var sources = [];
        for(var i=0; i<scripts.length; i++) {
            var src = scripts[i].src;
            if(src.length > 0)
                sources.push(src);
        }
        return sources;
    }
    
    var frameScriptSources  = scriptSourcesFromWindow(window);
    var parentScriptSources = scriptSourcesFromWindow(window.parent);
    
    for(var i=0; i<parentScriptSources.length; i++){
        var src = parentScriptSources[i];
        if(frameScriptSources.indexOf(src) == -1) {
            loadScriptSynchronously(src);
//            console.log('JS loaded: '+src);
        }
    }
}

// Same as above, but loads CSS files and also imports <style>…</style> sections.
function includeCSSUsedInParentWindow() {

    // Load CSSS files
    function loadCSSFile(href)
    {
        document.writeln('<link type="text/css" rel="stylesheet" href="'+src+'">');
    }
    
    function cssFilesFromWindow(win) {
        var links = win.document.getElementsByTagName('link');
        var sources = [];
        for(var i=0; i<links.length; i++) {
            var link = links[i];
            if(link.href.length > 0 && link.type == "text/css" && link.rel == "stylesheet")
                sources.push(link.href);
        }
        return sources;
    }
    
    var frameCSSFiles  = cssFilesFromWindow(window);
    var parentCSSFiles = cssFilesFromWindow(window.parent);
    
    for(var i=0; i<parentCSSFiles.length; i++){
        var src = parentCSSFiles[i];
        if(frameCSSFiles.indexOf(src) == -1) {
            loadCSSFile(src);
        }
    }

    // Import <style>…</style> sections:
    var parentStyles = window.parent.document.getElementsByTagName('style');
    for(var i=0; i<parentStyles.length; i++){
        var element = parentStyles[i];
        document.writeln('<style>'+element.innerHTML+'</style>');
    };
    
}

function WBLIFramePrepare(iFrame) {    
    // Create an eventBus for the iFrame:
    iFrame.eventBus = new EventBus();

//	iFrame.PWUniqueID = createUniqueID();
//	console.log('*** prepare an iFrame '+iFrame.PWUniqueID);

    PWWaitUntilIFrameIsLoaded(iFrame, function(){
        // Exchange the setStyle method in order to forward overflow styles to the appropriate element inside the iframe,
        // because overflow values on the iFrame have no effect.

        var overflowElement = Browser.firefox ? iFrame.contentDocument.getElementsByTagName('html')[0] : iFrame.contentDocument.body;
        
        // On load simply transfer the overflow values to the element inside the iframe:
        var overflowStyles = ['overflow', 'overflow-x', 'overflow-y'];
        var count = overflowStyles.length;
        for(var i=0; i<count; i++){
            var style = overflowStyles[i];
            overflowElement.setStyle(style, iFrame.getStyle(style));
        }
        
        // Exchange the setStyle method:
        iFrame.oldSetStyle = iFrame.setStyle;
        iFrame.setStyle = function(key, value){
            // Because we always set the overflow style on the iFrame we do not need to overwrite the getStyle method.
            iFrame.oldSetStyle.call(iFrame, key, value);
            if(key == 'overflow-y' || key == 'overflow-x' || key == 'overflow') // TODO: use indexOf = -1
                overflowElement.setStyle(key, value);
        }
    });
}

function URLOfIFrameBootJS() {
    var scripts = window.document.getElementsByTagName('script');
    var sources = [];
    for(var i=0; i<scripts.length; i++) {
        var src = scripts[i].src;
        if(src.length > 0 && src.contains('WBLIFrameComponent.js'))
            return src;
    }
    return null;
}

// This method provides an element which can be used to measure the size of html elements 
// without affecting the layout of the main document.
function GetLayoutIndependentMeasurementElement(onElementReady){
    if(!window._measurementElement){
        window._measurementElement = new Element('span', {
                styles: {
                    display: 'inline-block',
                    visibility: 'hidden',
                    'background-color': 'red',
                    position: 'absolute',
                }
        });

        // Using an iFrame just to measure the width of an element is three times faster than adding an absolutely positioned 
        // and invisible element to page. 
        window.measurementiFrame = new Element('iframe', {
                styles: {
                    visibility: 'hidden',
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    width: '100px',
                    height: '100px',
                    'z-index': 100
                },
                src: 'about:blank'
        });

        WBLIFramePrepare(this.measurementiFrame);
        window.measurementiFrame.inject(window.document.body); 
        var contentDocument = window.measurementiFrame.contentDocument;
        contentDocument.writeln('<html><head>');                
        contentDocument.writeln('<script type="text/javascript" src="'+URLOfIFrameBootJS()+'"></script>');
        contentDocument.writeln('<script>includeJavascriptFilesUsedInParentWindow();</script>');
        contentDocument.writeln('</head><body></body><script>window.frameIsLoaded = true;window.frameElement.eventBus.postNotification("iFrameDidLoad")</script></html>');

        PWWaitUntilIFrameIsLoaded(window.measurementiFrame, function(){
            // If we do not stop page loading inside the iFrame, Firefox will display the page load progress forever.
            // Was hard to find. This fix is only available for browsers which supportz the stop() method.
            // Also see: http://stackoverflow.com/questions/18353292/loading-indicator-stays-in-firefox-after-iframe-finished-loading
            if(window.measurementiFrame.contentWindow.stop)
                window.measurementiFrame.contentWindow.stop();
            
            var iFrameBody = window.measurementiFrame.contentDocument.body;
            iFrameBody.appendChild(window._measurementElement);
            iFrameBody.setStyle('overflow','hidden');            
            onElementReady(window._measurementElement);
        });
    } 
    else
        onElementReady(window._measurementElement);
}
