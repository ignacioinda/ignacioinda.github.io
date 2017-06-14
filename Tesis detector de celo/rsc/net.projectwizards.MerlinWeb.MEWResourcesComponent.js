MEWResourcesController = new Class({
    
    // componentElement is a splitview which separates the group view on the left side from the resources view on the right side
    initialize: function(componentElement){

        // Add us to the autorelease pool
        PWAutoreleasePool.addObjectToPoolForElement(this, componentElement);
        
        this.componentElement        = componentElement;
        this.groupsOutlineHeader     = componentElement.getElement('.part:first-child .header');
        this.resourcesOutlineHeader  = componentElement.getElement('.part:last-child  .header');
        this.scrollViews             = componentElement.getElements('.scrollview');
        
        // On zoom change, sync the row and header heights:
        var controller = this;
        var gantt = this.gantt;
        this.zoomDetector = new PWZoomDetector(function () {
            controller.updateGroupsHeaderHeight();
        });
        
        this.updateGroupsHeaderHeight.delay(100, this);
    },
    
    dispose: function() {
        //console.log('dispose MEWResourcesComponent');
    },

    // Make the height of the groups header the same as the height of the resources header:
    updateGroupsHeaderHeight: function() {
                                  
        this.groupsOutlineHeader.setStyle('height', this.resourcesOutlineHeader.offsetHeight);
        this.scrollViews[0].controller.updateLayout();
    },
    
    syncHeaderHeights: function() {
        this.groupsOutlineHeader.setStyle('height', (''+this.resourcesOutlineHeader.offsetHeight + 'px'));        
    }
});

MEWResourcesOutlineComponent = new Class({

    Extends: MEWOutlineController,
    initialize: function(outlineElement, adjustColumnWidths){
        this.parent(outlineElement, adjustColumnWidths);
        this.resourcesComponent = $$('.splitview')[0].resourcesComponent;
    },
    
    onColumnResize: function(el, headerColumn, contentColumn, index){
        this.parent(el, headerColumn, contentColumn, index);
        this.resourcesComponent.syncHeaderHeights();        
    }

});
