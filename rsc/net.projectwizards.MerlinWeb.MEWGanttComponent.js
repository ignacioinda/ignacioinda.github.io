MEWGanttController = new Class({
    
    // componentElement is a splitview which separates the outline view on the left side from the gantt view on the right side
initialize: function (componentElement) {
    
    // Add us to the autorelease pool
    PWAutoreleasePool.addObjectToPoolForElement(this, componentElement);
    
    // Set the delegate of the splitview:
    componentElement.controller.delegate = this;
    
    this.componentElement = componentElement;
    this.outlineHeader    = componentElement.getElement('.part:first-child .header');
    this.timeScale        = componentElement.getElement('.part:last-child .timeScale');
    this.outlineDocument  = document;
    this.ganttDocument    = document;
    
    var outlineTable = componentElement.getElement('.part:first-child .outlineTable');
    // If we can not find a outline table, we perhaps use iFrames. So we have to search inside the iFrame:
    if(!outlineTable) {
        var iFrame = componentElement.getElement('.part:first-child iframe');
        outlineTable = iFrame.contentDocument.getElement('.outlineTable');
        this.outlineDocument = iFrame.contentDocument;
    }
    this.outlineTableController = new MEWTableController(outlineTable);
    
    var ganttTable = componentElement.getElement('.part:last-child .gantt > .rows');
    // If we can not find a gantt table, we perhaps use iFrames. So we have to search inside the iFrame:
    if(!ganttTable){
        var iFrame = componentElement.getElement('.part:last-child iframe');
        ganttTable = iFrame.contentDocument.getElement('.gantt > .rows');
        this.ganttDocument = iFrame.contentDocument;
    }
    this.ganttTableController   = new MEWTableController(ganttTable);
    
    var labelViewTable = componentElement.getElement('.part:last-child .labelView');
    if(labelViewTable){
        this.labelViewTableController = new MEWTableController(labelViewTable);
        this.labelViewTableController.adjustBackgroundColorOfBackground();
    }
    
    this.outlineTableController.adjustBackgroundColorOfBackground();
    this.ganttTableController.adjustBackgroundColorOfBackground();
    
    
    // Delay the following setup in order to give the outline component the time to update the column widths.
    this.setupAfterOutlineIsReady.delay(0, this);
    
    // Let the scrollviews know about this controller
    this.componentElement.getElements('.scrollview').each(function(scrollview){
        scrollview.ganttController = this;
    }, this);
    
},
    
makeGanttRowsSelectable: function(){
    // see: MEWOutlineComponent.js
    var outlineComponent = this.componentElement.getElements('.outlineview')[0].outlineComponent;
    var makeRowClickable = function(row, index){
        row.addEvent('mousedown', function(event){
            var outlineRow = outlineComponent.rows()[index];
            outlineComponent.selectionEventInRow(outlineRow, index, event);
            event.stop();
        });
    }
    
    this.ganttTableController.rowsInTable(this.ganttTableController.table).each(function(row, index){
        makeRowClickable(row, index);
    });
    
    // Also make the label view rows selectable:
    if(this.labelViewTableController){
        this.labelViewTableController.rowsInTable(this.labelViewTableController.table).each(function(row, index){
            makeRowClickable(row, index);
        });
    }
},
    
setupAfterOutlineIsReady: function(){
    this.syncRowHeights();
    var componentElement = this.componentElement;
    var ganttElement = componentElement.getElement('.part:last-child .gantt');
    // If we can not find a gantt element, we perhaps use iFrames. So we have to search inside the iFrame:
    if(!ganttElement)
        ganttElement = componentElement.getElement('.part:last-child iframe').contentDocument.getElement('.gantt');
    this.gantt = new MEWGanttLinesController(ganttElement, this.timeScale, this.ganttDocument);
    
    // On zoom change, sync the row and header heights:
    var controller = this;
    var gantt = this.gantt;
    this.zoomDetector = new PWZoomDetector(function () {
        controller.syncRowHeights();
    });
    // Make horizontal scrollbars always visible in the outline and the gantt:
    // This is needed because otherwise vertical scroll positions could not be synced properly.
    componentElement.getElements('.main.content').each(function(content){
        content.setStyle('overflow-x','scroll');
    });
    
    this.makeGanttRowsSelectable();
    
    // React on clicks inside the gantt (make it the first responder)
    this.updateClickObserver();
},
    
updateClickObserver: function(){
    var me = this;
    this.gantt.ganttElement.addEvent('click', function(event){
      		me.clickedInsideGantt(event);
    });
},
    
clickedInsideGantt: function(event){
    //console.log('clicked inside gantt'); // TODO: Set first responder
},
    
dispose: function() {
    //console.log('dispose MEWGanttComponent');
    this.zoomDetector.dispose();
},
    
    // TODO: Create a method for all measuring needs taking into account the computed style.
preferredTimeScaleHeight: function()
    {
        return this.timeScale.getElements('.measuring')[0].offsetHeight;
    },
    
updateScrollViewLayout: function()
    {
        var scrollviews = this.componentElement.getElements('.scrollview');
        Array.each(scrollviews, function(scrollview){
            scrollview.controller.updateLayout();
        });
    },
    
syncHeaderHeights: function(){
    var rows         = this.componentElement.getElements(".timeScale > .tier");
    var numberOfRows = rows.length;
    
    // Clear all heights set in a previous sync call:
    Array.each(rows, function(row){
        row.setStyle('height', null);
        row.setStyle('line-height', null);
    });
    this.outlineHeader.setStyle('height', null);
    this.timeScale.setStyle('height', null);
    
    // Synchronize header heights (timescale and outline column headers):
    var outlineHeaderHeight = this.outlineHeader.offsetHeight;
    var timeScaleHeight     = this.preferredTimeScaleHeight();
    var maxHeight           = Math.max(outlineHeaderHeight, timeScaleHeight);
    
    // Setting the row height does not include the borders.
    // Because each row has a bottom border, we need to remove them from the calculation.
    var borderSpace  = numberOfRows;
    
    // Calculate row height and round it. Otherwise it would not look good in Webkit which needs whole-number heights.
    var rowHeight   = Math.round(((maxHeight-borderSpace) / numberOfRows));
    var rowHeightPx = rowHeight+'px';
    
    Array.each(rows, function(row){
        row.setStyle('height', rowHeightPx);
        row.setStyle('line-height', rowHeightPx);
    });
    
    // Calculate the final maximum height by using the rounded row heights:
    maxHeight   = ((rowHeight*rows.length)+borderSpace);
    maxHeightPx = maxHeight +'px';
    
    this.outlineHeader.setStyle('height', maxHeightPx);
    this.timeScale.setStyle('height', maxHeightPx);
    
    // Update the scrollview layout in the outline view and the gantt view:
    this.updateScrollViewLayout();
    
},
    
syncRowHeights: function() {
    this.syncHeaderHeights();
    
    // Synchronize table row heights:
    this.outlineTableController.syncRowHeightsWithOtherTable(this.ganttTableController);
    if(this.labelViewTableController)
        this.labelViewTableController.obtainRowHeightsFromOtherTableController(this.ganttTableController);
    
    this.verticallyCenterRowContent();
    this.adjustTickColumnWidth();
},
    
adjustTickColumnWidth: function(){
    if(this.labelViewTableController){
        var width = 0;
        this.labelViewTableController.table.getElements('.tickColumn').each(function(tickColumn){
            tickColumn.getElements('.tickLabel').each(function(tickLabel){
                if(width < tickLabel.offsetWidth)
                    width = tickLabel.offsetWidth;
            }, this);
        }, this);

        width += 10; // Eight pixel for the tick and some padding
        
        // Apply max width by injecting a css rule for .tickColumn
        if(!this.styleSheet)
            this.styleSheet = new Stylesheet();
        if(this.styleSheet.getRule('.tickColumn'))
            this.styleSheet.removeRule(0);
        this.styleSheet.addRules({'.tickColumn': { width: (width+'px') }});
    }
},
    
verticallyCenterRowContent: function(){
    this.ganttTableController.table.getElements('.posAnchor').each(function(posAnchor){
        if(!posAnchor.hasClass('histogram')){
            this.centerElementVertically(posAnchor);
            posAnchor.getElements('.innerSubrow').each(function(innerSubrow){
                this.centerElementVertically(innerSubrow);
            }, this);
        }
    }, this);
    if(this.labelViewTableController){
        this.labelViewTableController.table.getElements('.posAnchor').each(function(posAnchor){
            this.centerElementVertically(posAnchor);
            posAnchor.getElements('.innerSubrow').each(function(innerSubrow){
                this.centerElementVertically(innerSubrow);
            }, this);
        }, this);
    }
},
    
centerElementVertically: function(element){
    var parent = element.getParent();
    var innerParentHeight = parent.offsetHeight - parent.getStyle('padding-top').toInt() - parent.getStyle('padding-bottom').toInt();
    element.setStyle('top', ((innerParentHeight-element.offsetHeight)/2.0)+'px');
},
    
    // SplitView delegate methods:
splitViewWillMoveSplitter: function(splitviewController){
    //        console.log('splitViewWillMoveSplitter');
},
    
splitViewIsMovingSplitter: function(splitviewController){
    //        console.log('splitViewIsMovingSplitter');
},
    
splitViewDidMoveSplitter: function(splitviewController){
    //        console.log('splitViewDidMoveSplitter');
}
    
    });


// MEWTableController can sync the table row heights between two tables.
// Both tables must have the same row count and each row must have an additional cell (td/th)
// which contains a div with the class "otherTableRowDiv".
// Please see syncRowHeightsWithOtherTable for a description how the sync works.
//
// Table markup example:
//
//  <table>
//      <colgroup>
//         <col width="60px" span="2"/>
//      </colgroup>
//      <thead>
//          <tr>
//              <th><div">Column 1</div></th>
//              <th><div">Column 2</div></th>
//              <th class="hidden"><div class="otherTableRowDiv"></div></th>
//          </tr>
//      </thead>
//      <tbody>
//          <tr>
//              <td><div>Text 1</div></td>
//              <td><div>Text 2</div></td>
//              <td class="hidden"><div class="otherTableRowDiv"></td>
//          </tr>
//      </tbody>
//  </table>


MEWTableController = new Class({
Implements: [Options, Events],
options: {
    
    },
    
initialize: function(table, options){
    this.table = table;
},
    
    // Gets the maximum height of the content inside all td or th elements inside a tr element.
maxContentHeightInRow: function(tr) {
    // This seems to work now in Chrome, Safari and Firefox (4.4.2014).
    return Math.ceil(tr.getBoundingClientRect().height);
    
    // This is much to slow:
    /*
     var rowHeight = 0;
     // The timephase subrows have margins which seem to not be taken into account by getBoundingClientRect.
     // So we adjust the size accordingly (TODO: find a better way to fix this).
     // 2.0 is the sum of the top and bottom margins given to subrows in MEWGanttChartStyleSheet -> search for ".timePhase .row"
     var extraHeight = tr.hasClass('timePhase') ? 2.0 : 0.0;
     tr.getChildren().each(function(element){    // element = td or th
     var padding = element.getStyle('padding-top').toFloat() + element.getStyle('padding-bottom').toFloat();
     element.getChildren().each(function(contentElement){
     var height = contentElement.getBoundingClientRect().height + extraHeight + padding;
     if(height > rowHeight)
     rowHeight = height;
     });
     });
     return rowHeight;
     */
},
    
    // Returns all rows in a table, including the rows inside the header.
rowsInTable: function (table) {
    var result = [];
    var head = table.getElements('thead')[0];
    var headRows = head ? head.getChildren() : null;
    var body = table.getElements('tbody')[0];
    var bodyRows = body ? body.getChildren() : null;
    if(headRows)
        result.append(headRows);
    if(bodyRows)
        result.append(bodyRows);
    
    // Omit invisible rows which are created by the client only to measure text sizes.
    result = result.filter(function(element){
        return element.getStyle('visibility') != 'hidden';
    });
    return result;
},
    
    // Fetches row heights from this table and transfer them to the corresponding otherTableRowDivs in the other table.
    // Do the same with row heights from the other table and transfer them to this table.
syncRowHeightsWithOtherTable: function(otherTableController) {
    var table1 = this.table;
    var table2 = otherTableController.table;
    var table1Rows = this.rowsInTable(table1);
    var table2Rows = this.rowsInTable(table2);
    var controller = this;
    
    var divs  = [];
    var divs2 = [];
    
    // clear heights from previous sync calls:
    table1Rows.each(function(tr, index){
        var tr2 = table2Rows[index];
        if(!tr2)
            console.log("Error: Missing tr at index: ", index);
        tr.getElement('.otherTableRowDiv').setStyle('height', null);
        tr2.getElement('.otherTableRowDiv').setStyle('height', null);
    });
    
    // First measure the height:
    table1Rows.each(function(tr, index){
        var tr2 = table2Rows[index];
        var h1 = controller.maxContentHeightInRow(tr);
        var h2 = controller.maxContentHeightInRow(tr2);
        
        var maxHeight = Math.max(h1, h2) + 'px';
        
        var otherTableRowDiv  = tr.getElements('.otherTableRowDiv')[0];
        var otherTableRowDiv2 = tr2.getElements('.otherTableRowDiv')[0];
        otherTableRowDiv.rowHeight = maxHeight;
        otherTableRowDiv2.rowHeight = maxHeight;
        divs.push(otherTableRowDiv);
        divs2.push(otherTableRowDiv2);
    });
    
    // Then apply the measured heights to all rows in one step:
    // This is much faster than doing it in one loop.
    divs.each(function(div, index){
        var div2 = divs2[index];
        div.setStyle('height', ''+div.rowHeight);
        div2.setStyle('height', ''+div2.rowHeight);
    });
},
    
    // Changes the background color of the background container to be the color following the last row.
    // The background color is set serverside to the second color by using a css rule.
    // So we do nothing if we have only one row in the table.
adjustBackgroundColorOfBackground: function() {
    
    // This method does no longer work, because the alternating row colors are no longer opaque.
    
    // Note: this works only if the table is a child of an element with the class "background".
    //        var container = this.table.getParent('.background');
    //        var rows      = this.rowsInTable(this.table);
    //        if(rows.length > 1) {
    //            var color = rows[rows.length-2].getStyle('background-color');
    //            container.setStyle('background-color', color);
    //            console.log('Set to: '+color);
    //
    //        }
    
},
    
    // Sets the height of each row inside this table to the height of the row inside the other table.
obtainRowHeightsFromOtherTableController: function(otherTableController) {
    var ownTableRows   = this.rowsInTable(this.table);
    var otherTableRows = this.rowsInTable(otherTableController.table);
    ownTableRows.each(function(ownRow, index){
        var otherRow = otherTableRows[index];
        var otherRowHeight = otherRow.getElement('.otherTableRowDiv').getStyle('height');
        ownRow.getElement('.otherTableRowDiv').setStyle('height', otherRowHeight);
    });
}
    });

// MEWGanttLinesController completes the given ganttElement with gantt lines.
// The server generates markup which describes the connection between bars, but does not generate the
// actual connection lines. This is because the vertical layout is completely done by the browser.
// Hence the server has no knowledge about the exact end positions of the bars.
// The gantt lines are generated and placed inside the divs with class == "lines".
//
// The ganttElement markup is like this:
//
//      <div class="content_area">
//          <div class="gantt">
//
//              <table class="rows">
//                  <tr id="row1" class="row">
//                      ...
//                  </tr>
//                  <tr id="row2" class="row">
//                      ...
//                  </tr>
//              </table>
//
//              <svg class="lines" version="1.1" xmlns="http://www.w3.org/2000/svg">
//                  <g class="line" data-start-id="row1" data-end-id="row2" data-type="ES"></g>
//                                  ...
//              </svg>
//
//          </div>
//      </div>
//
// The style values like border-width, color and style are also generated by the server using CSS.
// Those style values are attached to the "line" div. MEWGanttLinesController uses them for the dynamically generated path segments
// and removes them afterwards from the "line" div, because otherwise the "line" div, which actually is an invisible
// container for the path segments, would show its border.

MEWGanttLinesController = new Class({
    
hDistanceMultiplicator: 0.65,
    
SVGNamespace: "http://www.w3.org/2000/svg",
    
showsCrispEdges: false,
    
addsOffsetsToMakeLinesCrisp: true,
    
initialize: function(ganttElement, timeScaleElement, ganttDocument){
    this.ganttDocument = ganttDocument;
    this.ganttElement = ganttElement;
    this.linesElement = this.ganttElement.getElements('.ganttLines')[0];
    this.timeScaleElement = timeScaleElement;
    this.updateStartAndEndMargins();
    this.updateMiddleLabels();
    if(ganttElement)
        this.createLines();
},
    
    // Fetches the style data, bar positions and bar sizes from the each line container description:
fetchBarPositionsAndLineStyles: function(lineContainers){
    var gantt = this;
    var ganttDocument = this.ganttDocument;
    Array.each(lineContainers, function(lineContainer, index){
        // All of our attribute names start with "data-", because such attributes may be used in HTML5 to provide custom data.
        
        // The line type must be one of the following:
        // "ES"   ->   End to Start
        // "SE"   ->   Start to End
        // "SS"   ->   Start to Start
        // "EE"   ->   End to End
        lineContainer.lineType = lineContainer.getAttribute('data-type');
        
        // Get the start and end rows:
        var startRow = ganttDocument.getElementById(lineContainer.getAttribute('data-start-id'));
        var endRow   = ganttDocument.getElementById(lineContainer.getAttribute('data-end-id'));
        
        // Get the start and end beams. A beam is the rectangular piece inside a gantt row. It could either be the used for a bar,
        // or inside a group to draw the bar.
        // I use the term "beam" because "bar" is already used to to discriminate between a bar row and a group row.
        lineContainer.startBeam = startRow ? startRow.getElement('.bar') : null;
        var startRhombContainer = lineContainer.startBeam ? lineContainer.startBeam.getParent('.rhombContainer') : null;
        if(startRhombContainer) {
            // We use the rhombContainer instead of the rhomb itself, because in webkit browsers, the position of the rhomb
            // is not available at this time. The size of the rhombContainer depends on the font size, just as the size of the rhomb.
            // So this should work as well.
            lineContainer.startBeam = startRhombContainer;
        }
        
        lineContainer.endBeam = endRow ? endRow.getElement('.bar') : null;
        var endRhombContainer = lineContainer.endBeam ? lineContainer.endBeam.getParent('.rhombContainer') : null;
        if(endRhombContainer)
            lineContainer.endBeam = endRhombContainer;
        
        // Save the bar coordinates and kink distances for start and end bars.
        lineContainer.beamMeasures = gantt.beamsMeasures(lineContainer.startBeam, lineContainer.endBeam);
        
        // Save the line style attributes.
        lineContainer.lineStyles = gantt.stylesFromLineContainer(lineContainer);
    });
},
    
updateLines: function(){
    this.removeLines();
    this.createLines();
},
    
    // Remove all gantt lines. Is used together with createLines to refresh all gantt lines.
removeLines: function() {
    var lines = this.linesElement;
    var childs = lines.getChildren ? lines.getChildren() : lines.children; // In firefox getChildren() is not defined.
    Array.each(childs, function(lineContainer){
        while (lineContainer.firstChild) {
            lineContainer.removeChild(lineContainer.firstChild);
        }
    });
},
    
    // Creates all gantt lines.
createLines: function(){
    // The mootools method setStyle is not available in Firefox for SVG elements.
    // Therefore I use the native style property directly.
    // But setting the display to 'none' and afterwards to 'block' is slower in FF.
    this.linesElement.style['display'] = 'none';
    
    // 1. Attach bar positions and calculated line styles to line containers:
    var lineContainers = this.ganttElement.getElements('.ganttLine');
    this.fetchBarPositionsAndLineStyles(lineContainers);
    
    // 2. Create lines:
    var gantt = this;
    Array.each(lineContainers, function(lineContainer){
        gantt.addLinesToContainer(lineContainer);
    });
    
    // Note: It is important to hide the svg element if it contains no elements,
    // because otherwise it would grab mouse events and does not forward them to other elements.
    if(lineContainers.length > 0)
        this.linesElement.style['display'] = 'block';
},
    
    // Adds an SVG path representing a gantt line to lineContainer.
addLinesToContainer: function(lineContainer){
    var startBeam   = lineContainer.startBeam;
    var endBeam     = lineContainer.endBeam;
    switch (lineContainer.lineType) {
        case 'ES': this.addLinesConnectedToMixedBarEnds(lineContainer, startBeam, endBeam, 'ES'); break;
        case 'SE': this.addLinesConnectedToMixedBarEnds(lineContainer, startBeam, endBeam, 'SE'); break;
        case 'SS': this.addStartToStartLines(lineContainer, startBeam, endBeam); break;
        case 'EE': this.addEndToEndLines(lineContainer, startBeam, endBeam); break;
    }
},
    
    // Returns a dictionary with style attributes fetched from lineContainer.
stylesFromLineContainer: function(lineContainer){
    var style = window.getComputedStyle(lineContainer);
    
    // It does not matter which side we get the border width, style and color from.
    // At start all sides have the same border values.
    // Here we take it from the left side.
    //
    // Note: It looks like Webkit does round down fractional values: 0.5 becomes 0.0!
    var lw = style.borderLeftWidth.toFloat();
    if(lw == 0)
        lw = 1.0;
    
    var result = {
    lineWidth:    lw,
    style:        style.borderLeftStyle,
    color:        style.borderLeftColor,
    borderRadius: 3 // Could be style value in the future
    };
    
    if(Browser.firefox) {
        // Firefox does not give us the "real" computed style:
        // The returned object actually represents the CSS 2.1 used values, not the computed values.
        // Originally, CSS 2.0 defined the computed values to be the "ready to be used" values of properties after cascading and inheritance,
        // but CSS 2.1 redefined computed values as pre-layout, and used values as post-layout. The getComputedStyle function returns the old
        // meaning of computed values, now called used values. There is no DOM API to get CSS 2.1 computed values.
        
        // Instead take the values from the element style if possible:
        var elementStyle = lineContainer.style;
        var lineWidth = elementStyle.borderWidth;
        var lineStyle = elementStyle.style;
        var lineColor = elementStyle.color;
        if(lineWidth)
            result.lineWidth = lineWidth.toFloat();
        if(lineStyle)
            result.style = lineStyle;
        if(lineColor)
            result.color = lineColor;
    }
    return result;
},
    
beamMeasures: function(beam)
    {
        if(!beam)
            return {};
        var origin = beam.getPosition(this.ganttElement);
        var size   = { width:beam.offsetWidth, height:beam.offsetHeight };
        
        // Note: This is the place where you can adjust the start and end positions of gantt lines
        //       to fit to special geometry like milestones.
        
        // In order to get the right vertical position of a milestone we need to ask the
        // rhomb container for its position. But the width of the rhomb container is 0px.
        // (The milestone is drawn outside the rhomb container). So we need to adjust the horizontal
        // position and size to match the visible milestone.
        if(beam.hasClass('rhombContainer'))
        {
            var bar     = beam.getChildren('.middleLabel .rhomb .bar')[0];
            var width   = bar.offsetWidth * Math.sqrt(2);  // Multiply with sqrt(2) because the rhomb is rotated by 45 degree.
            origin.x   -= width / 2.0;
            size.width  = width;
        }
        
        return { origin:origin, size:size };
    },
    
    // Returns the beam coordinates and kink distances for start and end bars.
    // Used in drawing methods.
beamsMeasures: function(startBeam, endBeam){
    var result = { start:this.beamMeasures(startBeam), end:this.beamMeasures(endBeam) };
    result['hDistanceFromStart'] = 10.0;
    result['hDistanceFromEnd']   = 10.0;
    return result;
},
    
    // Returns the coordinates of the row in which a bar lives.
rowCoordinatesForBar: function(bar) {
    var row = bar.getParent('.row');
    return {
    origin: row.getPosition(this.ganttElement),
    size: row.getSize()
    };
},
    
    // Returns the arrow size for a given line width.
arrowSizeForLineWidth: function (lineWidth) {
    var length = 5.0 + (lineWidth-1.0);
    return { width:length, height:length };
},
    
    // Returns an empty SVG path with the given line width and color.
emptySVGPath: function (lineWidth, color) {
    var result = this.ganttDocument.createElementNS(this.SVGNamespace, "path");
    result.setAttribute('style', 'fill:none; stroke:'+color+'; stroke-width:'+lineWidth+';');
    if(this.showsCrispEdges)
        result.setAttribute('shape-rendering', 'crispEdges');
    return result;
},
    
    // Returns an SGV path representing an arrow tipping at point in the given direction and with the given line width and color.
    // Direction can be: 'left', 'right', 'up' or 'down'.
svgArrow: function (tipPoint, direction, lineWidth, color) {
    var arrowLength = this.arrowSizeForLineWidth(lineWidth).width;
    var arrow = this.ganttDocument.createElementNS(this.SVGNamespace, "polygon");
    arrow.setAttribute('style', 'fill:'+color);
    if(this.showsCrispEdges)
        arrow.setAttribute('shape-rendering', 'crispEdges');
    var halfArrowLength = arrowLength / 2.0;
    switch (direction) {
        case 'right':
            arrow.setAttribute('points', ''+tipPoint.x+','+tipPoint.y+' '+(tipPoint.x-arrowLength)+','+(tipPoint.y-halfArrowLength)+' '+(tipPoint.x-arrowLength)+','+(tipPoint.y+halfArrowLength));
            break;
        case 'left':
            arrow.setAttribute('points', ''+tipPoint.x+','+ tipPoint.y+' '+(tipPoint.x+arrowLength)+','+(tipPoint.y-halfArrowLength)+' '+( tipPoint.x+arrowLength)+','+(tipPoint.y+halfArrowLength));
            break;
        case 'up':
            arrow.setAttribute('points', ''+tipPoint.x+','+tipPoint.y+' '+(tipPoint.x-halfArrowLength)+','+(tipPoint.y+arrowLength)+' '+(tipPoint.x+halfArrowLength)+','+(tipPoint.y+arrowLength));
            break;
        case 'down':
            arrow.setAttribute('points', ''+tipPoint.x+','+tipPoint.y+' '+(tipPoint.x-halfArrowLength)+','+(tipPoint.y-arrowLength)+' '+(tipPoint.x+halfArrowLength)+','+(tipPoint.y-arrowLength));
            break;
    }
    
    return arrow;
},
    
    // Creates and adds gantt lines to lineContainer for "start to end" and "end to start" connections.
addLinesConnectedToMixedBarEnds: function(lineContainer, startBeam, endBeam, type){
    var arrowAtEnd;
    var sv = lineContainer.lineStyles;
    var bm = lineContainer.beamMeasures;
    
    if(!bm.start.origin || !bm.end.origin)
        return;
    
    if(type=="ES")
        arrowAtEnd = true;
    else{
        arrowAtEnd = false;
        var bar = startBeam;
        startBeam = endBeam;
        endBeam = bar;
        
        var start = bm.start;
        bm.start = bm.end;
        bm.end = start;
        
        start = bm.hDistanceFromStart;
        bm.hDistanceFromStart = bm.hDistanceFromEnd;
        bm.hDistanceFromEnd = start;
    }
    
    var arrowLength = this.arrowSizeForLineWidth(sv.lineWidth).width;
    var addOffset = this.addsOffsetsToMakeLinesCrisp;
    var offset = addOffset ? (sv.lineWidth % 2 === 0 ? 0.0 : 0.5) : 0.0;
    
    // Points are named after the document "GanttLine.graffle" written by Torsten
    var S = { x:bm.start.origin.x+bm.start.size.width-1.0,  y:bm.start.origin.y+(bm.start.size.height/2.0)};
    if(addOffset)
        S.y = Math.round(S.y)+offset;
    var E = { x:bm.end.origin.x,                            y:bm.end.origin.y+(bm.end.size.height/2.0)};
    if(addOffset)
        E.y = Math.round(E.y)+offset;
    var A = { x:S.x+bm.hDistanceFromStart,                  y:S.y};
    if(addOffset)
        A.x = Math.round(A.x)+offset;
    var D = { x:E.x-bm.hDistanceFromEnd,                    y:E.y};
    if(addOffset)
        D.x = Math.round(D.x)+offset;
    
    
    // If the horizontal space between the two vertical lines is to small to be connected with arcs,
    // directly connect the lines. In order to do so, move them slightly.
    var distance = Math.abs(D.x - A.x);
    if(distance <= (sv.borderRadius * 2))
    {
        A.x = D.x;
    }
    
    var HStartTop    = { x:bm.start.origin.x+(bm.start.size.width/2.0), y:bm.start.origin.y};
    var HStartBottom = { x:HStartTop.x,                                 y:bm.start.origin.y+bm.start.size.height};
    var HEndTop      = { x:bm.end.origin.x+(bm.end.size.width/2.0),     y:bm.end.origin.y};
    var HEndBottom   = { x:HEndTop.x,                                   y:bm.end.origin.y+bm.end.size.height};
    
    var startBeamIsOnTop = bm.start.origin.y < bm.end.origin.y;
    
    var me = this;
    if(D.x < A.x) {
        if(S.x > E.x && A.x < HEndTop.x){
            if(type=='ES'){
                // Arrow points to top or to bottom:
                //
                //      S---S1-A
                //             |
                //            A1     HTop
                //      E ===========|
                
                var tipPoint = startBeamIsOnTop ? HEndTop : HEndBottom;
                tipPoint.x = A.x;
                var direction = startBeamIsOnTop ? 'down' : 'up';
                var A1 = {x:tipPoint.x, y:tipPoint.y + (startBeamIsOnTop ? -arrowLength : arrowLength)};
                var S1 = {x:A.x-sv.borderRadius, y:A.y};
                var path = this.emptySVGPath(sv.lineWidth, sv.color);
                path.setAttribute('d',   'M'+S.x+' '+S.y
                    + ' L'+S1.x+' '+S1.y
                    + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
                    + ' L'+A1.x+' '+A1.y);
                lineContainer.appendChild(path);
                A1.y += startBeamIsOnTop ? arrowLength : -arrowLength;
                lineContainer.appendChild(this.svgArrow(A1, direction, sv.lineWidth, sv.color));
                
            }else{
                // Arrow points to top or to bottom:
                //
                //       ===========|
                //            D1    HBottom
                //             |
                //             D-E1--E
                
                
                var tipPoint = startBeamIsOnTop ? HStartBottom : HStartTop;
                tipPoint.x = D.x;
                var direction = startBeamIsOnTop ? 'up' : 'down';
                var D1 = {x:tipPoint.x, y:tipPoint.y + (startBeamIsOnTop ? arrowLength : -arrowLength)};
                var E1 = {x:D.x+sv.borderRadius, y:E.y};
                var path = this.emptySVGPath(sv.lineWidth, sv.color);
                path.setAttribute('d',   'M'+E.x+' '+E.y
                    + ' L'+E1.x+' '+E1.y
                    + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+(-sv.borderRadius)+' '+(startBeamIsOnTop ? -sv.borderRadius : sv.borderRadius)+' '
                    + ' L'+D1.x+' '+D1.y
                    );
                lineContainer.appendChild(path);
                D1.y += startBeamIsOnTop ? -arrowLength : arrowLength;
                lineContainer.appendChild(this.svgArrow(D1, direction, sv.lineWidth, sv.color));
            }
        }else{
            // ZigZag line:             S---S1-A               D----E
            //                                 |               |
            //                                 |               C1
            //                                 A1              |
            //                                 |               |
            //                  C-B1-----------B       or      C-B1------------B
            //                  |                                              |
            //                  |                                              A1
            //                  C1                                             |
            //                  |                                              |
            //                  D----E                                   S--S1-A
            
            endRowCoordinates   = this.rowCoordinatesForBar(endBeam);
            startRowCoordinates = this.rowCoordinatesForBar(startBeam);
            var B;
            if(arrowAtEnd){
                E.x -= arrowLength; // Make room for the arrow
                B = { x:A.x, y:startBeamIsOnTop ? endRowCoordinates.origin.y : endRowCoordinates.origin.y+endRowCoordinates.size.y};
            }else{
                S.x += arrowLength;  // Make room for the arrow
                B = { x:A.x, y:startBeamIsOnTop ? startRowCoordinates.origin.y+startRowCoordinates.size.y : startRowCoordinates.origin.y};
            }
            if(addOffset)
                B.y = Math.round(B.y)+offset;
            var C  = { x:D.x, y:B.y};
            var S1 = { x:A.x-sv.borderRadius, y:A.y };
            var A1 = { x:A.x, y: startBeamIsOnTop ?  B.y-sv.borderRadius : B.y+sv.borderRadius };
            var B1 = { x:C.x+sv.borderRadius, y:B.y};
            var C1 = { x:D.x, y: startBeamIsOnTop ?  D.y-sv.borderRadius : D.y+sv.borderRadius};
            
            var path = this.emptySVGPath(sv.lineWidth, sv.color);
            path.setAttribute('d',   'M'+S.x+' '+S.y
                + ' L'+S1.x+' '+S1.y
                + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
                + ' L'+A1.x+' '+A1.y
                + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+(-sv.borderRadius)+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
                + ' L'+B1.x+' '+B1.y
                + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 0 : 1)+' '+(-sv.borderRadius)+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
                + ' L'+C1.x+' '+C1.y
                + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 0 : 1)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
                + ' L'+E.x+' '+E.y
                );
            lineContainer.appendChild(path);
            
            if(arrowAtEnd) {
                E.x += arrowLength;
                lineContainer.appendChild(this.svgArrow(E, 'right', sv.lineWidth, sv.color));
            }else {
                S.x -= arrowLength-1;
                lineContainer.appendChild(this.svgArrow(S, 'left', sv.lineWidth, sv.color));
            }
        }
    }else{
        
        // General case: S---S1-A                         D----E
        //                      |                         |
        //                      B           or            B1
        //                      |                         |
        //                      D----E              S-S1--A
        
        
        if(arrowAtEnd){
            E.x -= arrowLength; // Make room for the arrow
        }else{
            D = { x:S.x+bm.hDistanceFromEnd, y:E.y}; // keep the last kink closer to the arrow
            S.x += arrowLength;                      // Make room for the arrow
        }
        if(addOffset)
            D.x = Math.round(D.x)+offset;
        
        A.x = D.x;
        var B = {x:D.x, y:startBeamIsOnTop ? D.y-sv.borderRadius : D.y+sv.borderRadius};
        var S1 = {x:A.x-sv.borderRadius, y:A.y};
        
        var path = this.emptySVGPath(sv.lineWidth, sv.color);
        path.setAttribute('d',   'M'+S.x+' '+S.y
            + ' L'+S1.x+' '+S1.y
            + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
            + ' L'+B.x+' '+B.y
            + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 0 : 1)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
            + ' L'+E.x+' '+E.y
            );
        lineContainer.appendChild(path);
        if(arrowAtEnd) {
            E.x += arrowLength;
            lineContainer.appendChild(this.svgArrow(E, 'right', sv.lineWidth, sv.color));
        }else {
            S.x -= arrowLength-1;
            lineContainer.appendChild(this.svgArrow(S, 'left', sv.lineWidth, sv.color));
        }
    }
},
    
    // Creates and adds gantt lines to lineContainer for "start to start" connections.
addStartToStartLines: function(lineContainer, startBeam, endBeam){
    
    //  A-S1--S            B-B1--E
    //  |                  |
    //  |           or     A2
    //  A2                 |
    //  |                  |
    //  B-B1--E            A-S1--S
    
    var sv = lineContainer.lineStyles;
    var bm = lineContainer.beamMeasures;
    
    var startBeamIsOnTop = bm.start.origin.y < bm.end.origin.y;
    var addOffset = this.addsOffsetsToMakeLinesCrisp;
    var offset = addOffset ? (sv.lineWidth % 2 == 0 ? 0.0 : 0.5) : 0.0;
    
    var S  = { x:bm.start.origin.x, y:bm.start.origin.y+(bm.start.size.height/2.0)};
    if(addOffset)
        S.y = Math.round(S.y)+offset;
    var E  = { x:bm.end.origin.x, y:bm.end.origin.y+(bm.end.size.height/2.0)};
    if(addOffset)
        E.y = Math.round(E.y)+offset;
    var A  = { x:Math.min(S.x-bm.hDistanceFromStart, E.x-bm.hDistanceFromEnd), y:S.y };
    if(addOffset)
        A.x = Math.round(A.x)+offset;
    var B  = { x:A.x, y:E.y };
    var S1 = { x:A.x+sv.borderRadius, y:A.y };
    var B1 = { x:B.x+sv.borderRadius, y:B.y };
    var A2 = { x:A.x, y:B.y+ (startBeamIsOnTop ? -sv.borderRadius : +sv.borderRadius) };
    
    var arrowLength = this.arrowSizeForLineWidth(sv.lineWidth).width;
    E.x -= arrowLength;
    var path = this.emptySVGPath(sv.lineWidth, sv.color);
    path.setAttribute('d',   'M'+S.x+' '+S.y
        + ' L'+S1.x+' '+S1.y
        + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 0 : 1)+' '+(-sv.borderRadius)+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
        + ' L'+A2.x+' '+A2.y
        + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 0 : 1)+' '+(sv.borderRadius)+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
        + ' L'+E.x+' '+E.y);
    lineContainer.appendChild(path);
    E.x += arrowLength;
    lineContainer.appendChild(this.svgArrow(E, 'right', sv.lineWidth, sv.color));
},
    
    // Creates and adds gantt lines to lineContainer for "end to end" connections.
addEndToEndLines: function(lineContainer, startBeam, endBeam){
    
    //  S--S1-A            E--B1-B
    //        |                  |
    //        |     or          A2
    //       A2                  |
    //        |                  |
    //  E--B1-B            S--S1-A
    
    var sv = lineContainer.lineStyles;
    var bm = lineContainer.beamMeasures;
    
    var startBeamIsOnTop = bm.start.origin.y < bm.end.origin.y;
    var addOffset = this.addsOffsetsToMakeLinesCrisp;
    var offset = addOffset ? (sv.lineWidth % 2 == 0 ? 0.0 : 0.5) : 0.0;
    
    var S  = { x:bm.start.origin.x+bm.start.size.width, y:bm.start.origin.y+(bm.start.size.height/2.0)};
    if(addOffset)
        S.y = Math.round(S.y)+offset;
    var E  = { x:bm.end.origin.x+bm.end.size.width, y:bm.end.origin.y+(bm.end.size.height/2.0)};
    if(addOffset)
        E.y = Math.round(E.y)+offset;
    var A  = { x:Math.max(S.x+bm.hDistanceFromStart, E.x+bm.hDistanceFromEnd), y:S.y };
    if(addOffset)
        A.x = Math.round(A.x)+offset;
    var B  = { x:A.x, y:E.y };
    var S1 = { x:A.x-sv.borderRadius, y:A.y };
    var B1 = { x:B.x-sv.borderRadius, y:B.y };
    var A2 = { x:A.x, y:B.y+ (startBeamIsOnTop ? -sv.borderRadius : sv.borderRadius) };
    
    var arrowLength = this.arrowSizeForLineWidth(sv.lineWidth).width;
    E.x += arrowLength;
    var path = this.emptySVGPath(sv.lineWidth, sv.color);
    path.setAttribute('d',   'M'+S.x+' '+S.y
        + ' L'+S1.x+' '+S1.y
        + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+sv.borderRadius+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
        + ' L'+A2.x+' '+A2.y
        + ' a'+sv.borderRadius+' '+sv.borderRadius+' 0 0 '+(startBeamIsOnTop ? 1 : 0)+' '+(-sv.borderRadius)+' '+(startBeamIsOnTop ? sv.borderRadius : -sv.borderRadius)
        + ' L'+E.x+' '+E.y);
    lineContainer.appendChild(path);
    E.x -= arrowLength;
    lineContainer.appendChild(this.svgArrow(E, 'left', sv.lineWidth, sv.color));
},
    
clipGantt: function(startX, endX){
    
    // Clip the gantt
    var gantt   = this.ganttElement;
    var clipDiv = gantt.getParent();
    var clipDivWidth = endX-startX;
    clipDiv.setStyles({'overflow-x':'hidden', 'width':(clipDivWidth+'px'), 'min-width':'100%'});
    // Set the min-widtn to make the width of the gantt big enough.
    // The proper formular would be 100% + startx + 'px' but mixed units are not supported by all browsers.
    // We just set a big absolute value which includes both margins and the offset to the left.
    // In addition using an absolute value may be faster than a relative value, because the browser has nothing to calculate.
    var minWidth = (startX+2*2000) + 'px';
    gantt.setStyles({'left':('-'+startX+'px'), 'width':(endX+'px'), 'min-width':minWidth});
    
    // Clip the timescale
    var timeScale = this.timeScaleElement;
    clipDiv = timeScale.getParent();
    clipDiv.setStyles({'overflow-x':'hidden', 'width':(clipDivWidth+'px'), 'min-width':'100%'});
    timeScale.setStyles({'left':('-'+startX+'px'), 'min-width':minWidth});
    
    // Make the leftmost visible timescale text right aligned
    this.timeScaleElement.getElements('.tier').each(function(tier){
        tier.getElements('.cell').each(function(cell){
            var left = parseFloat(cell.getStyle('left'));
            if(left < startX){
                if(parseFloat(cell.getStyle('width')) + left >= startX){
                    cell.setStyles({'text-align':'right', 'padding-right':'5px'});
                }
            }
        });
    });
},
    
updateStartAndEndMargins: function(){
    
    var gantt = this.ganttElement;
    
    //gantt.addEvent('click', function(event){console.dir(event)});
    
    // Left margin calculation
    function leftLabelTDInRow(row){
        var barContainers = row.getElements('.barContainer');
        if(barContainers.length ==0)
            return null;
        
        var container = barContainers[0];
        var result = container.getElement('td:first-child');
        if(barContainers.length == 2){
            // We have a secondary bar so we compare the actual positions
            // The position of a bar, milestone or group is determined by the width of the first td element inside a bar container.
            var secondaryTD = barContainers[1].getElement('td:first-child');
            if(secondaryTD.getSize().x < result.getSize().x)
                result = secondaryTD;
        }
        return result;
    }
    
    function getBarEndX(container){
        var TDs = container.getElements('td');
        return TDs[0].getSize().x + TDs[1].getSize().x;
    }
    
    function rightLabelTDInRow(row){
        var barContainers = row.getElements('.barContainer');
        if(barContainers.length ==0)
            return null;
        
        var container = barContainers[0];
        var result = container.getElement('td:last-child');
        if(barContainers.length == 2){
            var secondaryContainer = barContainers[1];
            if(getBarEndX(secondaryContainer) > getBarEndX(container))
                result = secondaryContainer.getElement('td:last-child')
                }
        return result;
    }

    function getBoxesFromRow(row){
        var b1 = row.getElements('.timePhaseSubrow1 .box');
        if(!b1 || b1.length == 0)
            b1 = row.getElements('.timePhaseSubrow1 .hbox1'); // Histogram box

        var b2 = row.getElements('.timePhaseSubrow2 .box');
        if(!b2 || b2.length == 0)
            b2 = row.getElements('.timePhaseSubrow2 .hbox1');
        
        var b3 = row.getElements('.timePhaseSubrow3 .box');
        if(!b3 || b3.length == 0)
            b3 = row.getElements('.timePhaseSubrow3 .hbox1');
        return [(b1 ? b1 : []), (b2 ? b2 : []), (b3 ? b3 : [])];
    }
    
    function minXOfTimephaseBoxesInRow(row){
        var result = null;

        var boxes = getBoxesFromRow(row);
        var box1 = boxes[0]; box1 = box1.length>0 ? box1[0]: null;
        var box2 = boxes[1]; box2 = box2.length>0 ? box2[0]: null;
        var box3 = boxes[2]; box3 = box3.length>0 ? box3[0]: null;
        
        if(box1)
            result = parseFloat(box1.getStyle('left'));
        if(box2){
            var x = parseFloat(box2.getStyle('left'));
            result = result ? Math.min(x, result) : x;
        }
        if(box3){
            var x = parseFloat(box3.getStyle('left'));
            result = result ? Math.min(x, result) : x;
        }
        return result ? result : 0.0;
    }
    
    function getMaxXOfBox(box){
        var result = null;
        if(box) {
            result  = parseFloat(box.getStyle('left'));
            result += parseFloat(box.getStyle('width'));
        }
        return result;
    }
    
    function getLastVisibleBox(boxes){
        var iLast = boxes.length-1;
        for(var i=iLast; i>=0; i--)
        {
            var box = boxes[i];
            if(!box.hasClass('invisible'))
                return box;
        }
        return null;
    }
    
    function maxXOfTimephaseBoxesInRow(row){
        var result = null;

        var boxes  = getBoxesFromRow(row);
        var boxes1 = boxes[0];
        var boxes2 = boxes[1];
        var boxes3 = boxes[2];
        
        if(boxes1 && boxes1.length > 1)
            result = getMaxXOfBox(getLastVisibleBox(boxes1));
        if(boxes2 && boxes2.length > 1){
            var x = getMaxXOfBox(getLastVisibleBox(boxes2));
            result = result ? Math.max(x, result) : x;
        }
        if(boxes3 && boxes3.length > 1){
            var x = getMaxXOfBox(getLastVisibleBox(boxes3));
            result = result ? Math.max(x, result) : x;
        }
        return result ? result : 0;
    }
    
    // Calculate minimum and maximum x values by iterating over all rows:
    
    var minX = gantt.getProperty('data-earlieststartdateposition').toFloat();
    var maxX = 0.0;
    var additionalSpace = 10.0;
    
    gantt.getElements('.row').each(function(row, index){
        
        // Calculate the start margin:
        // We only need to look at the leftmost bar container because this one has a left label.
        var labelTD = leftLabelTDInRow(row);
        if(labelTD) {
            var barX = labelTD.getSize().x;
            minX = !minX ? barX : Math.min(barX, minX);
            var leftDIV = labelTD.getElement('.leftLabel');
            var leftLabelWidth = leftDIV.getSize().x + additionalSpace;    // Add 10 pixel between labels and the left border of the gantt view.
            var spacer = labelTD.getElement('.spacer');
            if(spacer)
                leftLabelWidth += spacer.getSize().x;
            var leftLabelX = barX - leftLabelWidth;
            minX = !minX ? leftLabelX : Math.min(leftLabelX, minX);
        }else{
            var minXTimephase = minXOfTimephaseBoxesInRow(row) - additionalSpace;
            if(minXTimephase > 0)
                minX = !minX ? minXTimephase : Math.min(minX, minXTimephase);
        }
        
        // Calculate the end margin:
        labelTD = rightLabelTDInRow(row);
        if(labelTD) {
            barX = getBarEndX(labelTD.getParent('.barContainer'));
            maxX = Math.max(barX, maxX);
            var rightDIV = labelTD.getElement('.rightLabel');
            var rightLabelWidth = rightDIV.getSize().x + additionalSpace;  // Add 10 pixel between labels and the left border of the gantt view.
            var spacer = labelTD.getElement('.spacer');
            if(spacer)
                rightLabelWidth += spacer.getSize().x;
            var rightLabelX = barX + rightLabelWidth;
            maxX = Math.max(rightLabelX, maxX);
        }else{
            var maxXTimephase = maxXOfTimephaseBoxesInRow(row) + additionalSpace;
            maxX = Math.max(maxX, maxXTimephase);
        }
    });

    this.clipGantt(minX, maxX);
},
    
updateMiddleLabels: function(){
    this.ganttElement.getElements('.middleLabel[data-short-value]').each(function(div){
        // Note: Detecting if the text is bigger than the div is not possible using div.scrollWidth > div.clientWidth.
        //       Because scrollWidth returns the size of the content only if 'overflow' is set to 'scroll'.
        var textWrapper = div.getElement('div');
        
        //console.log('textWrapper.width: '+textWrapper.getSize().x+' div.width: '+div.getSize().x);
        
        if(textWrapper.getSize().x > div.getSize().x){
            var shortText = div.getProperty('data-short-value');
            div.innerHTML = shortText;
            
            // Also replace the text inside the completed part if we have one:
            var middleLabelCompleted = div.getParent('.bar').getElement('.completed .middleLabel');
            if(middleLabelCompleted)
                middleLabelCompleted.innerHTML = shortText;
        }
    });
}
    });


MEWGanttOutlineController = new Class({
    
Extends: MEWOutlineController,
    
    
makeTableRowsSelectable: function(){
    this.parent();
    this.linkOutlineRowsWithGanttRows();
},
    
onColumnResize: function(el, headerColumn, contentColumn, index){
    this.parent(el, headerColumn, contentColumn, index);
    var ganttController = this.outlineElement['ganttController'];
    if(ganttController)
        ganttController.syncHeaderHeights();
},
    
onColumnResizeComplete: function(el, headerColumn, contentColumn, index){
    this.parent(el, headerColumn, contentColumn, index);
    var ganttController = this.outlineElement['ganttController'];
    if(ganttController){
        ganttController.syncRowHeights();
        ganttController.gantt.updateLines();
    }
},
    
ganttComponent: function(){
    if(!this._ganttComponent)
        this._ganttComponent = this.outlineElement.getParent('.splitview').ganttComponent;
    return this._ganttComponent;
},
    
ganttRows: function(){
    var tableController = this.ganttComponent().ganttTableController;
    return tableController.rowsInTable(tableController.table);
},
    
labelViewRows: function(){
    var tableController = this.ganttComponent().labelViewTableController;
    return tableController ? tableController.rowsInTable(tableController.table) : null;
},
    
linkOutlineRowsWithGanttRows: function(){
    var ganttRows = this.ganttRows();
    var outlineRows = this.rows();
    var labelViewRows = this.labelViewRows();
    
    outlineRows.each(function(outlineRow, index){
        outlineRow.ganttRow = ganttRows[index];
        if(labelViewRows)
            outlineRow.labelViewRow = labelViewRows[index];
    });
},
    
    // Selects all rows inside the gantt which are also selected in the outline. Deselects other rows.
applySelectionToGanttRows: function(){
    
    // TODO: make this more efficient
    
    var selClass      = this.classOfSelectedRows;
    var outlineRows   = this.rows();
    var ganttRows     = this.ganttRows();
    var labelViewRows = this.labelViewRows();
    var count         = outlineRows.length;
    
    for(var i=0; i<count; i++)
    {
        var outlineRowIsSelected = outlineRows[i].hasClass(selClass);
        var ganttRow             = ganttRows[i];
        // The label view is optional:
        var labelViewRow         = labelViewRows ? labelViewRows[i] : null;
        
        var ganttRowIsSelected   = ganttRow.hasClass(selClass);
        
        if(outlineRowIsSelected && !ganttRowIsSelected){
            ganttRow.addClass(selClass);
            if(labelViewRow)
                labelViewRow.addClass(selClass);
        }else if(!outlineRowIsSelected && ganttRowIsSelected){
            ganttRow.removeClass(selClass);
            if(labelViewRow)
                labelViewRow.removeClass(selClass);
        }
    }
},
    
    // Updates the invisible divs inside timePhaseSubrow1, 2 and 3 in order to change the height of the row.
    // Returns true if the classes have changed.
updateIntrinsicGanttRowHeightIfNeeded: function(ganttRow){
    var timePhaseSubrows = ganttRow.getElements('.timePhaseSubrow1, .timePhaseSubrow2, .timePhaseSubrow3');
    if(timePhaseSubrows.length)
        timePhaseSubrows.each(function(subrow){
            this.updateIntrinsicHeightOfTimephaseSubrow(subrow);
        }, this);
},
    
updateIntrinsicHeightOfTimephaseSubrow: function(subrow){
    
    // Get distinct classes from timephase boxes:
    // TODO: Do not do this for every box. Instead manage a set with used classes
    //       which is updated everytime a row is selected or deselected. Then this method
    //       needs only to create invisible box elements with those classes.
    var distinctBoxClasses   = {};
    var distinctLabelClasses = {};
    var boxes = subrow.getChildren('.box');
    if(boxes.length > 0){
        boxes.each(function(box){
            // Only take classes from visible boxes.
            if(!box.hasClass('invisible')) {
                distinctBoxClasses[box.className] = true;
                var label = box.getChildren('.tplabel')[0];
                distinctLabelClasses[label.className] = true;
            }
        });
    }
    this.updateInvisibleBoxesInSubrow(subrow, distinctBoxClasses, distinctLabelClasses);
},
    
    // Note distinctBoxClasses and distinctLabelClasses must have the same count of elements.
updateInvisibleBoxesInSubrow: function(subrow, distinctBoxClasses, distinctLabelClasses){
    
    var invisibleBoxes = subrow.getElements('.box.invisible');
    var oldLength = invisibleBoxes.length;
    var newLength = Object.getLength(distinctBoxClasses);
    //console.log('old: '+oldLength +' new: '+newLength);
    if(newLength > oldLength){
        // Create more boxes if needed:
        for(;oldLength<newLength; oldLength++){
            var box   = new Element('div');
            var label = new Element('div');
            label.inject(box);
            box.inject(subrow);
            invisibleBoxes.push(box);
        }
    }

//    // Let enough boxes take part in the layout:
//    invisibleBoxes.each(function(box, index){
//        box.setStyle('display', index < newLength ? /*'table-cell'*/'inline-block' : 'none');
//    });
    
    // Apply the right classes to each used invisible box:
    if(newLength > 0) {
        Object.keys(distinctBoxClasses).each(function(className, index){
            var box = invisibleBoxes[index];
            box.className = 'invisible ' + className;
            var label = box.getChildren()[0];
            label.className = 'tplabel invisibleText ';// + className;
        });
    }
},
    
    // Fills the normal css classes cache of elements with a server side selection.
prepareRowsWithServerSideSelection: function(){
    // This is for the outline part:
    this.parent();
    
    // This is for the gantt part:
    var selectedClassProperty = this.selectedClassProperty;
    var notSelectedClassProperty = this.notSelectedClassProperty;
    
    this.ganttComponent().ganttTableController.table.getElements('['+notSelectedClassProperty+']').each(function(element){
        element.isNotSelectedClass = element.getProperty(notSelectedClassProperty);
        element.setProperty(selectedClassProperty, element.getProperty('class'));
    });
},
    
selectSingleRow: function(row, index){
    this.parent(row, index);
    this.applySelectionToGanttRows();
},
    
selectUpToRow: function(row, index){
    this.parent(row, index);
    this.applySelectionToGanttRows();
},
    
toggleSelectionOfRow: function(row, index){
    this.parent(row, index);
    this.applySelectionToGanttRows();
},
    
addSelectionStyleToRow: function(row, index){
    this.parent(row, index);
    if(row.ganttRow) {
        this.parent(row.ganttRow, index);
        this.updateIntrinsicGanttRowHeightIfNeeded(row.ganttRow);
        // The labelView is optional
        if(row.labelViewRow)
            this.parent(row.labelViewRow, index);
    }
},
    
removeSelectionStyleFromRow: function(row, index){
    this.parent(row, index);
    if(row.ganttRow) {
        this.parent(row.ganttRow, index);
        this.updateIntrinsicGanttRowHeightIfNeeded(row.ganttRow);
        // The labelView is optional
        if(row.labelViewRow)
            this.parent(row.labelViewRow, index);
    }
},
    
updateSelectionBorders: function(){
    var selClass      = 'selected';
    var outlineRows   = this.rows();
    var ganttRows     = this.ganttRows();
    var labelViewRows = this.labelViewRows();
    var count         = outlineRows.length;
    
    var previousRow   = null;
    var previousGanttRow = null;
    var previousLabelViewRow = null;
    var previousRowIsSelected = false;
    
    for(var i=0; i<count; i++)
    {
        var row = outlineRows[i];
        var ganttRow = ganttRows[i];
        var labelViewRow = labelViewRows ? labelViewRows[i] : null;
        
        var rows = labelViewRow ? [row, ganttRow, labelViewRow] : [row, ganttRow];
        
        var isSelected = row.hasClass(selClass);
        if(!isSelected){
            this.removeSelectionTopBorderFromRows(rows, i);
            this.removeSelectionBottomBorderFromRows(rows, i);
        }
        
        var previousRows = previousLabelViewRow ? [previousRow, previousGanttRow, previousLabelViewRow] : [previousRow, previousGanttRow];
        
        if(!previousRowIsSelected && isSelected)
            this.addSelectionTopBorderToRows(rows, i);
        else if(!isSelected && previousRowIsSelected)
            this.addSelectionBottomBorderToRows(previousRows, i-1);
        else if(isSelected && previousRowIsSelected) {
            this.removeSelectionBottomBorderFromRows(previousRows, i-1);
            this.removeSelectionTopBorderFromRows(rows, i);
        }
        
        if(isSelected && i == count-1){
            this.addSelectionBottomBorderToRows(rows, i);
        }
        
        previousRowIsSelected = isSelected;
        previousRow = row;
        previousGanttRow = ganttRow;
        previousLabelViewRow = labelViewRow;
    }
},
    
selectionStyleDidChangeInRowsWithIndex: function(rowsWithIndex){
    this.parent(rowsWithIndex);
    if(rowsWithIndex.length > 0){
        var ganttComp = this.ganttComponent();
        var t1 = ganttComp.outlineTableController;
        var t2 = ganttComp.ganttTableController;
        t1.syncRowHeightsWithOtherTable(t2);
        ganttComp.gantt.updateLines();
        
        // TODO: Only sync the heights of the given rows
        //        rowsWithIndex.each(function(dict){
        //            var row = dict.row;
        //            var index = dict.index;
        //        });
    }
},
    
    
    
syncRowHeights: function(row1, row2){
    
    // TODO: Only sync the heights of the given rows
    //
    //    	var div1 = row1.getElement('.otherTableRowDiv');
    //        var div2 = row2.getElement('.otherTableRowDiv');
    //	    div1.setStyle('height', null);
    //        div2.setStyle('height', null);
    //        var maxHeight = Math.max(row1.getBoundingClientRect().height, row2.getBoundingClientRect().height) + 'px';
    //	    div1.setStyle('height', maxHeight);
    //	    div2.setStyle('height', maxHeight);
}
    });

