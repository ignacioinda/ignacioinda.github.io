// WBLScrollComponentController implements the behavior of a scroll view with a vertical or/and a horizontal ruler.
// Both rulers are optional. The scroll positions between ruler and main content can be synced (also optional).
//
// Scroll view markup example:
//
//	<div class="scrollview">
//		<div class="vertical ruler">
//			<div class="corner"></div>
//			<div class="content">
//				...
//			</div>
//		</div>
//
//		<div class="horizontal ruler">
//				...
//		</div>
//		<div class="main content">
//				...
//		</div>
//	</div>

WBLScrollComponentController = new Class({
    Implements: [Options],
    options: {
		// If true the horizontal scroll position of the content is applied to the horizontal ruler as well.
		syncHorizontalRulerScrollPosition: true,

		// If true the vertical scroll position of the content is applied to the vertical ruler as well.
		syncVerticalRulerScrollPosition: true,

		// A string which is put in front of the regular content inside the iFrame.
		preIFrameContent: null,

		// A string which is put after the regular content inside the iFrame.
		postIFrameContent: null
    },


	initialize: function(scrollView, options){
		this.setOptions(options);

        // Add us to the autorelease pool
        PWAutoreleasePool.addObjectToPoolForElement(this, scrollView);
        
        scrollView.controller       = this;
		this.scrollView             = scrollView;		

        this.useIFramesIfNeeded();
                                         
        this.iFrames 				= this.scrollView.getElements('iframe');
		this.containsIFrame 		= this.iFrames.length > 0;
        
        this.horizontalRuler        = scrollView.getElement('.horizontal.ruler');
		this.horizontalRulerContent = this.horizontalRuler.getChildren()[0];
		this.verticalRulerContent   = scrollView.getElement('.vertical.ruler .content');
		this.verticalRulerCorner    = scrollView.getElement('.vertical.ruler .corner');
				
		this.updateLayout();

		this.setupSyncScrollPositionWithRulers();
		this.scrollBarsWidth = WBLScrollComponentController.scrollbarWidth();

		if(this.containsIFrame){
			var me = this;
			PWWaitUntilIFramesAreLoaded(this.iFrames, function(){
				me.updateHasHorizontalScroller();
				me.updateHasVerticalScroller();
			});
		}
		else
		{
			this.updateHasHorizontalScroller();
			this.updateHasVerticalScroller();
		}
	},

    dispose: function() {
        //console.log('dispose WBLScrollComponentController');
        
        // Dispose scroll and mouse events established in setupSyncScrollPositionWithRulers
        this.disposeScrollAndMouseWheelEvents();
    },

	useIFramesIfNeeded: function() {

        // The main content is the element which is replaced by an iFrame in webkit browsers.
		this.mainContent = this.scrollView.getElement('.main.content');		

        // Use iframes in all brosers but not in Firefox, because the scrolling speed in firefox is fast enough.
        // Note: If we want to use iFrames in Firefox too, we need to adjust the scrolling code. It does not work out of the box.
		
        //return; // TEST TEST
        
        if(!Browser.firefox /*PWIsWebkit()*/) {
			var iFrameClass   = this.mainContent.get('class') + ' contentIFrame'; 
			
			// Load the script which is needed inside the iFrame in order to import scripts and css from the main window: 
            // Note: It is very important to include the <!DOCTYPE html> tag, because otherwise strange style rules will be applied.
            var iFrameContent = "<!DOCTYPE html><script src=\""+URLOfIFrameBootJS()+"\"></script><script>includeJavascriptFilesUsedInParentWindow(); includeCSSUsedInParentWindow();</script>";
			if(this.options.preIFrameContent)
				iFrameContent += this.options.preIFrameContent.decodeBase64();

			iFrameContent += this.mainContent.innerHTML;

			if(this.options.postIFrameContent)
				iFrameContent += this.options.postIFrameContent.decodeBase64();		

            // Finally add a marker used to detect if a frame is fully loaded and post a related notification.
            // See mootools-pwextensions.js -> PWWaitUntilIFrameIsLoaded().
			//          function postDidLoadFrame(){
			// 			    window.frameIsLoaded = true;
			// 			    window.eventBus().postNotification("iFrameDidLoad");	
			// 			}
			// 
			// 			if(document.readyState == "complete")
			// 				postDidLoadFrame();
			// 			else
			// 				document.addEvent('readystatechange', function() {
			// 			    	if (document.readyState == "complete")
			// 					postDidLoadFrame();
			// 				});
            iFrameContent += '<script>function postDidLoadFrame(){window.frameIsLoaded=true;window.eventBus().postNotification("iFrameDidLoad")}if(document.readyState=="complete")postDidLoadFrame();else document.addEvent("readystatechange",function(){if(document.readyState=="complete")postDidLoadFrame()})</script>';

			var iFrame = new Element('iframe', {'class':iFrameClass, 'frameborder':'0'});
			WBLIFramePrepare(iFrame);
			var parent = this.mainContent.parentElement;

            // Needed if the iFrame is used in conjunction with a vertical ruler
            var wrapper = new Element('div', {'class':'iFrameWrapper'});
            wrapper.appendChild(iFrame);
            parent.replaceChild(wrapper, this.mainContent)

			var frameDocument = iFrame.contentDocument;
			frameDocument.open();
			frameDocument.write(iFrameContent);
			frameDocument.close();
			
			this.mainContent = iFrame;
		}
	},

	scrollElement: function() {
		// Note: Works only with one iFrame
		var result = this.scrollView.getElements('.main.content')[0];
		if(this.containsIFrame)
			result = PWIEVersion()>0 ? result.contentDocument.body.parentElement : result.contentDocument.body;
        return result;
	},

	verticalScrollerIsVisible: function() {
		if(this.containsIFrame){
			 if(!this.mainContent.contentDocument || !this.mainContent.contentDocument.body)
			 	return false;
			 return    this.scrollBarsWidth > 0 
			 		&& this.mainContent.clientHeight < this.mainContent.contentDocument.body.scrollHeight
			 		&& this.mainContent.getStyle('overflow-y') != 'hidden';			
		}
		else
			return 	   this.scrollBarsWidth > 0 
					&& this.mainContent.clientHeight < this.mainContent.scrollHeight 
					&& this.mainContent.getStyle('overflow-y') != 'hidden';
	},
	
	horizontalScrollerIsVisible: function() {
		if(this.containsIFrame){
			if(!this.mainContent.contentDocument || !this.mainContent.contentDocument.body)
			 	return false;
			 return    this.scrollBarsWidth > 0
			 		&& this.mainContent.clientWidth < this.mainContent.contentDocument.body.scrollWidth
			 		&& this.mainContent.getStyle('overflow-x') != 'hidden';			
		}
		else
			return 	   this.scrollBarsWidth > 0
					&& this.mainContent.clientWidth < this.mainContent.scrollWidth
					&& this.mainContent.getStyle('overflow-x') != 'hidden';
	},



	// The horizontal ruler never has a vertical scrollbar.
	// But the main content perhaps has one. So both areas could have a different width.
	// We add some padding to the right side of the ruler content instead of showing a scrollbar..
	// This is needed because otherwise horizontal scroll positions could not be synced properly.
	updateHasVerticalScroller: function() {
        var hasVerticalScroller = this.verticalScrollerIsVisible();
        if(this.hasVerticalScroller != hasVerticalScroller)
        {
			this.hasVerticalScroller = hasVerticalScroller;
			this.updateRulerPaddingRight();
        }
	},

	updateHasHorizontalScroller: function() {
        var hasHorizontalScroller = this.horizontalScrollerIsVisible();
        if(this.hasHorizontalScroller != hasHorizontalScroller)
        {
			this.hasHorizontalScroller = hasHorizontalScroller;
			this.updateRulerPaddingRight();
        }
	},

	updateRulerPaddingRight: function() {
		var padding = '0px';
		if(this.hasVerticalScroller && this.hasHorizontalScroller)
			padding = this.scrollBarsWidth+'px';
		this.horizontalRulerContent.setStyle('padding-right', padding);
    },
	
	setupSyncScrollPositionWithRulers: function() {

		if(this.options.syncHorizontalRulerScrollPosition || this.options.syncVerticalRulerScrollPosition) {

			function setupSync(){
				// Sync the scroll position of the main content with the rulers.			
				// If the main content is an iFrame use its body instead:
				var iFrame;
                var mainContent = this.mainContent;
                if(this.containsIFrame) {
                    iFrame = this.iFrames[0];
                	mainContent = PWIEVersion()>0 ? iFrame.contentDocument.body.parentElement : iFrame.contentDocument.body;
                }
                
				var scrollView = this;
				var syncContentScrollPositionWithRulers = function() {
		            if(scrollView.options.syncHorizontalRulerScrollPosition && scrollView.horizontalRuler) {
                        if(scrollView.horizontalRuler.scrollLeft != mainContent.scrollLeft)
							scrollView.horizontalRuler.scrollLeft = mainContent.scrollLeft;
					}
					if(scrollView.options.syncVerticalRulerScrollPosition && scrollView.verticalRulerContent) {
						if(scrollView.verticalRulerContent.scrollTop != mainContent.scrollTop)
							scrollView.verticalRulerContent.scrollTop = mainContent.scrollTop;
					}
				};

				// In case we use iFrames we do not get a scroll event on the iFrame's body, but on its defaultView
				// which is the window. But we still need to use scrollLeft/Top of the body. It is a little bit confusing but works.
				if(this.containsIFrame)
					iFrame.contentDocument.defaultView.addEvent('scroll', syncContentScrollPositionWithRulers);
				else
					mainContent.addEvent('scroll', syncContentScrollPositionWithRulers);

				// Sync the scroll positions of the rulers with the main content.
				// We need to add mouse wheel events to the rulers because they have no scrollbars
				// and therefore fire no scroll events .
				var verticalRulerContent = this.verticalRulerContent;
				var horizontalRuler = this.horizontalRuler;

				var doMouseWheelInRuler = function(event, ruler) {
					var deltas = event.wheelDeltas();
					if(ruler == verticalRulerContent) {
						ruler.scrollTop  -= deltas.y;
						mainContent.scrollTop = ruler.scrollTop;
					}else if (ruler == horizontalRuler) {
						ruler.scrollLeft -= deltas.x;
						mainContent.scrollLeft = ruler.scrollLeft;
					}
					event.stop();
				};

				if(this.options.syncVerticalRulerScrollPosition && verticalRulerContent)
					verticalRulerContent.addEvent('mousewheel', function(event){
						doMouseWheelInRuler(event, verticalRulerContent);
					});

				if(this.options.syncHorizontalRulerScrollPosition && horizontalRuler)
					horizontalRuler.addEvent('mousewheel', function(event){
						doMouseWheelInRuler(event, horizontalRuler);
					});
			}

			var me = this;
			if(this.containsIFrame){
				PWWaitUntilIFramesAreLoaded(this.iFrames, function(){
					setupSync.call(me);
				});
			}
			else
				setupSync.call(me);

		}
	},
	
    disposeScrollAndMouseWheelEvents: function(){
        var mainContent = this.mainContent;
        if(this.containsIFrame && this.iFrames[0].contentDocument)
            this.iFrames[0].contentDocument.defaultView.removeEvents('scroll');
        else
            mainContent.removeEvent('scroll');
        if(this.options.syncVerticalRulerScrollPosition)
            this.verticalRulerContent.removeEvents('mousewheel');
		if(this.options.syncHorizontalRulerScrollPosition)
            this.horizontalRuler.removeEvents('mousewheel');
    },
    
    
	// updateLayout needs to be called from outside whenever the size of the surrounding element did change.
	updateLayout: function () {
        this.updateHasVerticalScroller();
		this.updateHasHorizontalScroller();

		var contentHeight = this.scrollView.offsetHeight;

		// Adjust the height of the main content view:
		if(this.horizontalRuler){
			contentHeight -= this.horizontalRuler.offsetHeight;
            this.mainContent.setStyle('height', contentHeight+'px');
		}

        if( this.verticalRulerContent && this.verticalRulerCorner && this.horizontalRuler){
             // Adjust the height of the corner view to match the height of the horizontal ruler view:
             this.verticalRulerCorner.setStyle('height', this.horizontalRuler.offsetHeight+'px');
         
             // Set the height of the vertical ruler content to the content height:
             this.verticalRulerContent.setStyle('height', contentHeight-WBLScrollComponentController.scrollbarWidth()+'px');
        }
    }
});

WBLScrollComponentController.scrollbarWidth = function() {
  if(WBLScrollComponentController._scrollBarWidth===undefined) {

		// Create the measurement node
		var scrollDiv = new Element("div", {'styles':{'width':'100px', 'height':'100px', 'overflow':'scroll', 'position':'absolute', 'top':'-999px'}});
		document.body.appendChild(scrollDiv);

		// Get the scrollbar width
		WBLScrollComponentController._scrollBarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;

		// Delete the DIV 
		document.body.removeChild(scrollDiv);
  }
    return WBLScrollComponentController._scrollBarWidth;
};
