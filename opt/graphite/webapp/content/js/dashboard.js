// Global object names
var viewport;
var contextSelector;
var contextSelectorFields = [];
var selectedScheme = null;
var metricSelector;
var metricSelectorMode;
var metricSelectorGrid;
var metricSelectorTextField;
var graphArea;
var graphStore;
var graphView;
var navBar;
var dashboardName;
var dashboardURL;
var refreshTask;
var spacer;
var justClosedGraph = false;
var NOT_EDITABLE = ['from', 'until', 'width', 'height', 'target', 'uniq'];

// G3 global vars.
var viz_type = "graphite"; // 'graphite' || 'd3' || 'cubism'
var graphType = 0;
var d3_menu_force = false;
var cubism_state = {};
  // The list of comparison pair metrics.
  cubism_state.compairs = [];  
var cubism_metrics = [
  "testStuff",
  "*.agents.shelbymetrix-a.cpuUsage"
];

var selectedCubismGraph = undefined;

var toggleCubismMetric = function(name) {
  if (cubism_metrics.indexOf(name) == -1)  {
  	cubism_metrics.push(name);
  }
  else cubism_metrics.remove(name);
  cubismInit();
}

var cubismToggleSelect = function() {
	var element = this.children[1];
	if (selectedCubismGraph == undefined) {		
		element.classList.add('selected');
		selectedCubismGraph = element;
	}
	else if (element == selectedCubismGraph) {
		element.classList.remove('selected');
		selectedCubismGraph = undefined;
	}
	else {
		var secondary_name = this.children[1].innerHTML;
		var primary_name = selectedCubismGraph.innerHTML;		
		var primary = cubism_state.gr.metric(primary_name);
		var secondary = cubism_state.gr.metric(secondary_name);
		cubism_state.compairs.push([primary, secondary]);			
		selectedCubismGraph.classList.remove('selected');
		selectedCubismGraph = undefined;
		updateCubismComparisons();	
	}
}


var cubismRemoveComparison = function(prim, sec) {
  for (var i = 0; i < cubism_state.compairs.length; i++) {
    if (prim == cubism_state.compairs[i][1] &&
	sec  == cubism_state.compairs[i][0])
	cubism_state.compairs.splice(i,1);
  }
  updateCubismComparisons();
}

var updateCubismComparisons = function() {
  d3.select("#ext-comp-1008").selectAll(".comparison").data([]).exit().remove();

  var sel = d3.select("#ext-comp-1008").selectAll(".comparison")		
  	.data(cubism_state.compairs);

      sel.enter().append("div")
	 .attr("class", "comparison")
	 .call(cubism_state.comp)
	 .on("dblclick", function(d){ cubismRemoveComparison(d[1], d[0]); })

     sel.exit().remove();
}

var cubismInit = function() {

if (selectedCubismGraph != undefined) {
	selectedCubismGraph.classList.remove('selected');
	selectedCubismGraph = undefined;
}

document.getElementById('ext-comp-1008').innerHTML="";
var cub_ctx = cubism.context().step('60000').size(document.getElementById('ext-comp-1008').clientWidth);
var cub_g   = cub_ctx.graphite('');
cubism_state.ctx = cub_ctx;
cubism_state.comp = cub_ctx.comparison()
	.colors(['#3182bd','#add8e6','#31a354','#90ee90'])
	.title(function(d){ 
		var n1 = ('' + d[0]).split('.');
		var n2 = ('' + d[1]).split('.');
		n1 = n1[n1.length-1];
		n2 = n2[n2.length-1]
		return n1 + ' vs ' + n2; 
	 })
	.height(80)
cubism_state.gr = cub_g;
d3.select("#ext-comp-1008").selectAll(".axis")
    .data(["top"])
  .enter().append("div")
    .attr("class", function(d) { return d + " axis"; })
    .style('fill', 'white')
    .each(function(d) { d3.select(this).call(cub_ctx.axis().ticks(12).orient(d)); });

d3.select("#ext-comp-1008").append("div")
    .attr("class", "rule")
    .call(cub_ctx.rule());

var node = d3.select("#ext-comp-1008").selectAll(".horizon")
    .data(cubism_metrics)
  .enter().insert("div", ".bottom")
    .attr("class", "horizon")
    .call(cub_ctx.horizon().metric(cub_g.metric)).on("click", cubismToggleSelect);

cub_ctx.on("focus", function(i) {
  d3.selectAll(".value").style("right", i == null ? null : cub_ctx.size() - i + "px");
});

updateCubismComparisons();
}

var cookieProvider = new Ext.state.CookieProvider({
  path: "/dashboard"
});

var NAV_BAR_REGION = cookieProvider.get('navbar-region') || 'west';

var CONFIRM_REMOVE_ALL = cookieProvider.get('confirm-remove-all') != 'false';

var D3Graphs = new Array();
var D3GraphID = 0;
var G = new G3.GraphiteClient("");

/* Nav Bar configuration */
var navBarNorthConfig = {
  region: 'north',
  layout: 'hbox',
  layoutConfig: { align: 'stretch' },
  collapsible: true,
  collapseMode: 'mini',
  split: true,
  title: "untitled",
  height: 350,
  listeners: {
    expand: function() { focusCompleter(); } // defined below
  }
};

var navBarWestConfig = Ext.apply({}, navBarNorthConfig);
delete navBarWestConfig.height;
navBarWestConfig.region = 'west';
navBarWestConfig.layout = 'vbox';
navBarWestConfig.width = 338;


// Record types and stores
var SchemeRecord = Ext.data.Record.create([
  {name: 'name'},
  {name: 'pattern'},
  {name: 'fields', type: 'auto'}
]);

var schemeRecords = [];

var schemesStore = new Ext.data.Store({
  fields: SchemeRecord
});

var ContextFieldValueRecord = Ext.data.Record.create([
  {name: 'name'},
  {path: 'path'}
]);

var contextFieldStore = new Ext.data.JsonStore({
  url: '/metrics/find/',
  root: 'metrics',
  idProperty: 'name',
  fields: ContextFieldValueRecord,
  baseParams: {format: 'completer', wildcards: '1'}
});


var GraphRecord = new Ext.data.Record.create([
  {name: 'target'},
  {name: 'params', type: 'auto'},
  {name: 'url'},
  {name: 'graph'}
]);

var graphStore;
function graphStoreUpdated() {
  if (metricSelectorGrid) metricSelectorGrid.getView().refresh();
}

graphStore = new Ext.data.ArrayStore({
  fields: GraphRecord,
  listeners: {
    add: graphStoreUpdated,
    remove: graphStoreUpdated,
    update: graphStoreUpdated
  }
});

var originalDefaultGraphParams = {
  from: '-2hours',
  until: 'now',
  width: UI_CONFIG.default_graph_width,
  height: UI_CONFIG.default_graph_height
};
var defaultGraphParams;
//XXX
// Per-session default graph params
var sessionDefaultParamsJson = cookieProvider.get('defaultGraphParams');
if (sessionDefaultParamsJson && sessionDefaultParamsJson.length > 0) {
  defaultGraphParams = Ext.decode(sessionDefaultParamsJson);
} else {
  defaultGraphParams = Ext.apply({}, originalDefaultGraphParams);
}


function initDashboard () {

  // Populate naming-scheme based datastructures
  Ext.each(schemes, function (scheme_info) {
    scheme_info.id = scheme_info.name;
    schemeRecords.push( new SchemeRecord(scheme_info) );

    Ext.each(scheme_info.fields, function (field) {

      // Context Field configuration
      contextSelectorFields.push( new Ext.form.ComboBox({
        id: scheme_info.name + '-' + field.name,
        fieldLabel: field.label,
        width: CONTEXT_FIELD_WIDTH,
        mode: 'remote',
        triggerAction: 'all',
        editable: true,
        forceSelection: false,
        store: contextFieldStore,
        displayField: 'name',
        queryDelay: 100,
        queryParam: 'query',
        minChars: 1,
        typeAhead: false,
        value: queryString[field.name] || getContextFieldCookie(field.name) || "*",
        listeners: {
          beforequery: buildQuery,
          change: contextFieldChanged,
          select: function (thisField) { thisField.triggerBlur(); focusCompleter(); },
          afterrender: function (thisField) { thisField.hide(); },
          hide: function (thisField) { thisField.getEl().up('.x-form-item').setDisplayed(false); },
          show: function (thisField) { thisField.getEl().up('.x-form-item').setDisplayed(true); }
        }
      }) );

    });

  });
  schemesStore.add(schemeRecords);

  spacer = new Ext.form.TextField({
    hidden: true,
    hideMode: 'visibility'
  });

  var metricTypeCombo = new Ext.form.ComboBox({
    id: 'metric-type-field',
    fieldLabel: 'Metric Type',
    width: CONTEXT_FIELD_WIDTH,
    mode: 'local',
    triggerAction: 'all',
    editable: false,
    store: schemesStore,
    displayField: 'name',
    listeners: {
      afterrender: function (combo) {
        var value = (queryString.metricType) ? queryString.metricType : getContextFieldCookie('metric-type');

        if (!value) {
          value = "Everything";
        }
        var index = combo.store.find("name", value);
        if (index > -1) {
          var record = combo.store.getAt(index);
          combo.setValue(value);
          metricTypeSelected.defer(250, this, [combo, record, index]);
        }
      },
      select: metricTypeSelected
    }
  });

   var graphTypeCombo = new Ext.form.ComboBox({
     id: 'graph-type-field',
     fieldLabel: 'Vizualizer Type',
     width: CONTEXT_FIELD_WIDTH,
     mode: 'local',
     triggerAction: 'all',
     editable: false,
     value: "Graphite",
     store: new Ext.data.SimpleStore({
       fields: ["value", "text"],
       data: [ [0, "Graphite"], [1, "D3"], [2, "D3 - Cubism"] ],
     }),
     displayField: 'text',
     hiddenField: 'value',
     allowBlank: false,
     listeners: {
      select: graphTypeSelected
    }
   });
   
   var typeTypeCombo = new Ext.form.ComboBox({
     id: 'type-type-field',
     fieldLabel: 'Graph Type',
     width: CONTEXT_FIELD_WIDTH,
     mode: 'local',
     triggerAction: 'all',
     editable: false,
     value: "Line Graph",
     store: new Ext.data.SimpleStore({
       fields: ["value", "text"],
       data: [ [0, "Line Graph"], [1, "Histogram"] ],
     }),
     displayField: 'text',
     hiddenField: 'value',
     allowBlank: false,
     listeners: {
      select: typeTypeSelected
    }
   });
   
   typeTypeCombo.disable();
   
   function typeTypeSelected(combo, record, index) {
   		graphType = this.selectedIndex;
   }

 function graphTypeSelected(combo, record, index) {
 	graphStore.removeAll();
 	var value = combo.getValue();
	switch(this.selectedIndex) { 
	case 0:  // Graphite images.
		viz_type = "graphite";
 		graphView.tpl = graphTemplate;
 		graphStore.fields = GraphRecord;
 		typeTypeCombo.disable();
		break;
	case 1:  // D3 standard.
		viz_type = "d3";
 		graphView.tpl = d3graphTemplate;
 		graphStore.fields = GraphRecord;
 		typeTypeCombo.enable();
		break;
	case 2:  // D3 Cubism.
		viz_type = "cubism";
		cubism_metrics = [];
		cubismInit();
		typeTypeCombo.disable();
		break;
	}
 }

  contextSelector = new Ext.form.FormPanel({
    flex: 1,
    autoScroll: true,
    labelAlign: 'right',
    items: [
      spacer,
      metricTypeCombo,
      graphTypeCombo,
      typeTypeCombo,
    ].concat(contextSelectorFields)
  });

  function expandNode(node, recurse) {
    function addAll () {
      Ext.each(node.childNodes, function (child) {
        if (child.leaf) {
          graphAreaToggle(child.id, {dontRemove: true});
        } else if (recurse) {
          expandNode(child, recurse);
        }
      });
    }

    if (node.isExpanded()) {
      addAll();
    } else {
      node.expand(false, false, addAll);
    }
  }

  var folderContextMenu = new Ext.menu.Menu({
    items: [{
      text: "Add All Metrics",
      handler: function (item, e) {
                 expandNode(item.parentMenu.node, false);
               }
    }, {
      text: "Add All Metrics (recursively)",
      handler: function (item, e) {
                 expandNode(item.parentMenu.node, true);
               }
    }]
  });

  if (NAV_BAR_REGION == 'west') {
    metricSelectorMode = 'tree';
    metricSelector = new Ext.tree.TreePanel({
      root: new Ext.tree.TreeNode({}),
      containerScroll: true,
      autoScroll: true,
      flex: 3.0,
      pathSeparator: '.',
      rootVisible: false,
      singleExpand: false,
      trackMouseOver: true,
      listeners: {
      click: metricTreeSelectorNodeClicked,
      contextmenu: function (node, e) {
                     if (!node.leaf) {
                       folderContextMenu.node = node;
                       folderContextMenu.showAt( e.getXY() );
                     }
                   }
      }
    });
  } else { // NAV_BAR_REGION == 'north'
    metricSelectorMode = 'text';
    metricSelectorGrid = new Ext.grid.GridPanel({
      region: 'center',
      hideHeaders: true,
      loadMask: true,
      bodyCssClass: 'terminalStyle',

      colModel: new Ext.grid.ColumnModel({
        defaults: {
          sortable: false,
          menuDisabled: true
        },
        columns: [
          {header: 'Metric Path', width: 1.0, dataIndex: 'path'}
        ]
      }),
      viewConfig: {
        forceFit: true,
        rowOverCls: '',
        bodyCssClass: 'terminalStyle',
        getRowClass: function(record, index) {
          var toggledClass = (
             graphStore.findExact('target', 'target=' + record.data.path) == -1
            ) ? "metric-not-toggled" : "metric-toggled";
          var branchClass = (
            record.data['is_leaf'] == '0'
          ) ? "result-is-branch-node" : "";
          return toggledClass + ' ' + branchClass + ' metric-result';
        }
      },
      selModel: new Ext.grid.RowSelectionModel({
        singleSelect: false
      }),
      store: new Ext.data.JsonStore({
        method: 'GET',
        url: '/metrics/find/',
        autoLoad: true,
        baseParams: {
          query: '',
          format: 'completer',
          automatic_variants: (UI_CONFIG.automatic_variants) ? '1' : '0'
        },
        fields: ['path', 'is_leaf'],
        root: 'metrics'
      }),
      listeners: {
        rowclick: function (thisGrid, rowIndex, e) {
                    var record = thisGrid.getStore().getAt(rowIndex);
                    if (record.data['is_leaf'] == '1') {
                      graphAreaToggle(record.data.path);
                      thisGrid.getView().refresh();
                    } else {
                      metricSelectorTextField.setValue(record.data.path);
                    }
                    autocompleteTask.delay(50);
                    focusCompleter();
                  }
      }
    });

    function completerKeyPress(thisField, e) {
      var charCode = e.getCharCode();
      if (charCode == 8 ||  //backspace
          charCode >= 46 || //delete and all printables
          charCode == 36 || //home
          charCode == 35) { //end
        autocompleteTask.delay(AUTOCOMPLETE_DELAY);
      }
    }

    metricSelectorTextField = new Ext.form.TextField({
      region: 'south',
      enableKeyEvents: true,
      cls: 'completer-input-field',
      listeners: {
        keypress: completerKeyPress,
        specialkey: completerKeyPress,
        afterrender: focusCompleter
      }
    });
    metricSelector = new Ext.Panel({
      flex: 1.5,
      layout: 'border',
      items: [metricSelectorGrid, metricSelectorTextField]
    });
  }

  var autocompleteTask = new Ext.util.DelayedTask(function () {
    var query = metricSelectorTextField.getValue();
    var store = metricSelectorGrid.getStore();
    store.setBaseParam('query', query);
    store.load();
  });

  var graphTemplate = new Ext.XTemplate(
    '<tpl for=".">',
      '<div class="graph-container">',
        '<div class="graph-overlay">',
          '<img class="graph-img" src="{url}">',
          '<div class="overlay-close-button" onclick="javascript: graphAreaToggle(\'{target}\'); justClosedGraph = true;">X</div>',
        '</div>',
      '</div>',
    '</tpl>',
    '<div class="x-clear"></div>'
  );
  
    var d3graphTemplate = new Ext.XTemplate(
    '<tpl for=".">',
      '<div class="graph-container" oncontextmenu="return false;">',
        '<div class="graph-overlay" id="{url}">',
          '<div class="overlay-close-button" onclick="javascript: graphAreaToggle(\'{target}\'); justClosedGraph = true;">X</div>',
        '</div>',
      '</div>',
    '</tpl>',
    '<div class="x-clear"></div>'
  );

  function setupGraphDD () {
    graphView.dragZone = new Ext.dd.DragZone(graphView.getEl(), {
      containerScroll: true,
      ddGroup: 'graphs',

      getDragData: function (e) {
        var sourceEl = e.getTarget(graphView.itemSelector, 10);
        if (sourceEl) {
          var dupe = sourceEl.cloneNode(true);
          dupe.id = Ext.id();
          return {
            ddel: dupe,
            sourceEl: sourceEl,
            repairXY: Ext.fly(sourceEl).getXY(),
            sourceStore: graphStore,
            draggedRecord: graphView.getRecord(sourceEl)
          }
        }
      },

      getRepairXY: function () {
        return this.dragData.repairXY;
      }

    });

    graphView.dropZone = new Ext.dd.DropZone(graphView.getEl(), {
      ddGroup: 'graphs',
      dropAction: 'reorder',
      mergeEl: Ext.get('merge'),

      getTargetFromEvent: function (e) {
        return e.getTarget(graphView.itemSelector);
      },

      onNodeEnter: function (target, dd, e, data) {
        //Ext.fly(target).addClass('graph-highlight');
        this.setDropAction('reorder');
        this.mergeTarget = Ext.get(target);
        this.mergeSwitchTimeout = this.setDropAction.defer(UI_CONFIG.merge_hover_delay, this, ['merge']);
      },

      onNodeOut: function (target, dd, e, data) {
        //Ext.fly(target).removeClass('graph-highlight');
        this.mergeEl.hide();
        //this.setDropAction('reorder');
      },

      onNodeOver: function (target, dd, e, data) {
        return Ext.dd.DropZone.prototype.dropAllowed;
      },

      setDropAction: function (action) {
        if (this.mergeSwitchTimeout != null) {
          clearTimeout(this.mergeSwitchTimeout);
          this.mergeSwitchTimeout = null;
        }

        this.dropAction = action;
        if (action == 'reorder') {
          //revert merge ui change
          this.mergeEl.hide();
        } else if (action == 'merge') {
          //apply merge ui change
          this.mergeEl.show();
          var targetXY = this.mergeTarget.getXY();
          var mergeElWidth = Math.max(GraphSize.width * 0.75, 20);
          var xOffset = (GraphSize.width - mergeElWidth) / 2;
          var yOffset = -14;
          this.mergeEl.setXY([targetXY[0] + xOffset, targetXY[1] + yOffset]);
          this.mergeEl.setWidth(mergeElWidth);
        }
      },

      onNodeDrop: function (target, dd, e, data){ 
        var nodes = graphView.getNodes();
        var dropIndex = nodes.indexOf(target);
        var dragIndex = graphStore.indexOf(data.draggedRecord);

        if (dragIndex == dropIndex) {
          return false;
        }

        if (this.dropAction == 'reorder') {
          graphStore.removeAt(dragIndex);
          graphStore.insert(dropIndex, data.draggedRecord);
          updateGraphRecords();
          return true;
        } else if (this.dropAction == 'merge') {
          var dragRecord = data.draggedRecord;
          var dropRecord = graphView.getRecord(target);
          if (dropRecord.data.params.target.length == 1) {
            if (dropRecord.data.params.target[0] == dropRecord.data.params.title) {
              delete dropRecord.data.params.title;
            }
          }

          var mergedTargets = uniq( dragRecord.data.params.target.concat(dropRecord.data.params.target) );
          dropRecord.data.params.target = mergedTargets;
          dropRecord.data.target = Ext.urlEncode({target: mergedTargets});
          //if (viz_type == "graphite") {
          	dropRecord.commit();
          //}
          graphStore.remove(dragRecord);
          dropRecord.graph = undefined;
          updateGraphRecords();
          return true;
        }
        return false;
      }
    });
  }


  graphView = new Ext.DataView({
    store: graphStore,
    tpl: graphTemplate,
    overClass: 'graph-over',
    itemSelector: 'div.graph-container',
    emptyText: "Configure your context above, and then select some metrics.",
    autoScroll: true,
//    plugins: [
//      new Ext.ux.DataViewTransition({
//        duration: 750,
//        idProperty: 'target'
//      })
//    ],
    listeners: {
      click: graphClicked,
      contextmenu: graphCtx,
      render: setupGraphDD
    }
  });

  /* Toolbar items */
  var relativeTimeRange = {
          icon: CLOCK_ICON,
          text: "Relative Time Range",
          tooltip: 'View Recent Data',
          handler: selectRelativeTime,
          scope: this
  };

  var absoluteTimeRange = {
    icon: CALENDAR_ICON,
    text: "Absolute Time Range",
    tooltip: 'View Specific Time Range',
    handler: selectAbsoluteTime,
    scope: this
  };

  var timeRangeText = {
    id: 'time-range-text',
    xtype: 'tbtext',
    text: getTimeText()
  };

  var dashboardMenu = {
    text: 'Dashboard',
    menu: {
      items: [
        {
          text: "New",
          handler: function (item, e) {
                     setDashboardName(null);
                     if (NEW_DASHBOARD_REMOVE_GRAPHS) {
                       graphStore.removeAll();
                     }
                     refreshGraphs();
                   }
        }, {
          text: "Finder",
          handler: showDashboardFinder
        }, {
          id: 'dashboard-save-button',
          text: "Save",
          handler: function (item, e) {
                     sendSaveRequest(dashboardName);
                   },
          disabled: (dashboardName == null) ? true : false
        }, {
          text: "Save As",
          handler: saveDashboard
        }, {
          text: "Configure UI",
          handler: configureUI
        }
      ]
    }
  };

  var graphsMenu = {
    text: 'Graphs',
    menu: {
      items: [
        {
          text: "Edit Default Parameters",
          handler: editDefaultGraphParameters
        }, {
          text: "Resize",
          handler: selectGraphSize
        }, {
          text: "Remove All",
          handler: removeAllGraphs
        }
      ]
    }
  };

  var shareButton = {
    icon: SHARE_ICON,
    tooltip: "Share This Dashboard",
    text: "Share",
    handler: doShare
  };

  var helpButton = {
    icon: HELP_ICON,
    tooltip: "Keyboard Shortcuts",
    handler: showHelp
  };

  var resizeButton = {
    icon: RESIZE_ICON,
    tooltip: "Resize Graphs",
    handler: selectGraphSize
  };

  var removeAllButton = {
    icon: REMOVE_ICON,
    tooltip: "Remove All Graphs",
    handler: removeAllGraphs
  };

  var refreshButton = {
    icon: REFRESH_ICON,
    tooltip: 'Refresh Graphs',
    handler: refreshGraphs
  };

  var autoRefreshButton = {
    xtype: 'button',
    id: 'auto-refresh-button',
    text: "Auto-Refresh",
    enableToggle: true,
    pressed: false,
    tooltip: "Toggle auto-refresh",
    toggleHandler: function (button, pressed) {
                     if (pressed) {
                       startTask(refreshTask);
                     } else {
                       stopTask(refreshTask);
                     }
                   }
  };

  var every = {
    xtype: 'tbtext',
    text: 'every'
  };

  var seconds = {
    xtype: 'tbtext',
    text: 'seconds'
  };

  var autoRefreshField = {
    id: 'auto-refresh-field',
    xtype: 'textfield',
    width: 25,
    value: UI_CONFIG.refresh_interval,
    enableKeyEvents: true,
    disableKeyFilter: true,
    listeners: {
      change: function (field, newValue) { updateAutoRefresh(newValue); },
      specialkey: function (field, e) {
                    if (e.getKey() == e.ENTER) {
                      updateAutoRefresh( field.getValue() );
                    }
                  }
    }
  };

  var lastRefreshed = {
    xtype: 'tbtext',
    text: 'Last Refreshed: '
  };

  var lastRefreshedText = {
    id: 'last-refreshed-text',
    xtype: 'tbtext',
    text: ( new Date() ).format('g:i:s A')
  };

  graphArea = new Ext.Panel({
    region: 'center',
    layout: 'fit',
    autoScroll: false,
    bodyCssClass: 'graph-area-body',
    items: [graphView],
    tbar: new Ext.Toolbar({
      items: [
        dashboardMenu,
        graphsMenu,
        '-',
        shareButton,
        '-',
        relativeTimeRange,
        absoluteTimeRange,
        ' ',
        timeRangeText,
        '->',
        helpButton,
        resizeButton,
        removeAllButton,
        refreshButton,
        autoRefreshButton,
        every, autoRefreshField, seconds,
        '-',
        lastRefreshed, lastRefreshedText
      ]
    })
  });

  /* Nav Bar */
  navBarNorthConfig.items = [metricSelector];
  navBarWestConfig.items = [contextSelector, metricSelector];
  var navBarConfig = (NAV_BAR_REGION == 'north') ? navBarNorthConfig : navBarWestConfig;
  navBar = new Ext.Panel(navBarConfig);

  viewport = new Ext.Viewport({
    layout: 'border',
    items: [
      navBar,
      graphArea
    ]
  });

  refreshTask = {
    run: refreshGraphs,
    interval: UI_CONFIG.refresh_interval * 1000
  };

  // Load initial dashboard state if it was passed in
  if (initialState) {
    applyState(initialState);
  }

  if (initialError) {
    Ext.Msg.alert("Error", initialError);
  }
}

function showHelp() {
  var win = new Ext.Window({
    title: "Keyboard Shortcuts",
    modal: true,
    width: 550,
    height: 300,
    autoLoad: "/dashboard/help/"
  });
  win.show();
}

function metricTypeSelected (combo, record, index) {
  selectedScheme = record;

  // Show only the fields for the selected context
  Ext.each(contextSelectorFields, function (field) {
    if (field.getId().indexOf( selectedScheme.get('name') ) == 0) {
      field.show();
    } else {
      field.hide();
    }
  });

  setContextFieldCookie("metric-type", combo.getValue());
  contextFieldChanged();
  focusCompleter();
}


function buildQuery (queryEvent) {
  var queryString = "";
  var parts = selectedScheme.get('pattern').split('.');
  var schemeName = selectedScheme.get('name');

  // Clear cached records to force JSON queries every time
  contextFieldStore.removeAll();
  delete queryEvent.combo.lastQuery;

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var field = part.match(/^<[^>]+>$/) ? part.substr(1, part.length - 2) : null;

    if (field == null) {
      queryString += part + '.';
      continue;
    }

    var combo = Ext.getCmp(schemeName + '-' + field);
    var value = combo.getValue();

    if (UI_CONFIG.automatic_variants) {
      if (value.indexOf(',') > -1 && value.search(/[{}]/) == -1) {
        value = '{' + value + '}';
      }
    }

    if (combo === queryEvent.combo) {
      queryEvent.query = queryString + queryEvent.query + '*';
      return;
    } else {
      if (value) {
        queryString += value + '.';
      } else {
        Ext.Msg.alert('Missing Context', 'Please fill out all of the fields above first.');
        queryEvent.cancel = true;
        return;
      }
    }
  }

  Ext.Msg.alert('Error', 'Failed to build query, could not find "' + queryEvent.combo.getId() + '" field');
  queryEvent.cancel = true;
}


function contextFieldChanged() {
  var pattern = getContextFieldsPattern();
  if (pattern) metricSelectorShow(pattern);
}

function getContextFieldsPattern() {
  var schemeName = selectedScheme.get('name');
  var pattern = selectedScheme.get('pattern');
  var fields = selectedScheme.get('fields');
  var missing_fields = false;

  Ext.each(fields, function (field) {
    var id = schemeName + '-' + field.name;
    var value = Ext.getCmp(id).getValue();

    // Update context field cookies
    setContextFieldCookie(field.name, value);

    if (UI_CONFIG.automatic_variants) {
      if (value.indexOf(',') > -1 && value.search(/[{}]/) == -1) {
        value = '{' + value + '}';
      }
    }

    if (value.trim() == "") {
      missing_fields = true;
    } else {
      pattern = pattern.replace('<' + field.name + '>', value);
    }
  });

  if (missing_fields) {
    return;
  }

  return pattern;
}

function metricSelectorShow(pattern) {
  if (metricSelectorMode == 'tree') {
    metricTreeSelectorShow(pattern);
  } else {
    metricTextSelectorShow(pattern);
  }
}

function metricTreeSelectorShow(pattern) {
  var base_parts = pattern.split('.');

  function setParams (loader, node, callback) {
    loader.baseParams.format = 'treejson';

    if (node.id == 'rootMetricSelectorNode') {
      loader.baseParams.query = pattern + '.*';
    } else {
      var id_parts = node.id.split('.');
      id_parts.splice(0, base_parts.length); //make it relative
      var relative_id = id_parts.join('.');
      loader.baseParams.query = pattern + '.' + relative_id + '.*';
    }
  }

  var loader = new Ext.tree.TreeLoader({
    url: '/metrics/find/',
    requestMethod: 'GET',
    listeners: {beforeload: setParams}
  });

  try {
    var oldRoot = Ext.getCmp('rootMetricSelectorNode')
    oldRoot.destroy();
  } catch (err) { }

  var root = new Ext.tree.AsyncTreeNode({
    id: 'rootMetricSelectorNode',
    loader: loader
  });

  metricSelector.setRootNode(root);
  root.expand();
}

function metricTextSelectorShow(pattern) {
  var store = metricSelectorGrid.getStore();
  store.setBaseParam('query', pattern);
  store.load();
}


function metricTreeSelectorNodeClicked (node, e) {
  if (!node.leaf) {
    node.toggle();
    return;
  }

  graphAreaToggle(node.id);
}


function graphAreaToggle(target, options) {
  /* The GraphRecord's id is their URL-encoded target=...&target=... string
     This function can get called with either the encoded string or just a raw
     metric path, eg. "foo.bar.baz".
  */
  var graphTargetString;
  if (target.substr(0,7) == "target=") {
    graphTargetString = target;
  } else {
	graphTargetString = "target=" + target;
  }
  var graphTargetList = Ext.urlDecode(graphTargetString)['target'];
  if (typeof graphTargetList == 'string') {
    graphTargetList = [graphTargetList];
  }

  var existingIndex = graphStore.findExact('target', graphTargetString);

  if (existingIndex > -1) {
    if ( (options === undefined) || (!options.dontRemove) ) {
      graphStore.removeAt(existingIndex);
    }
  } else if ( (options === undefined) || (!options.onlyRemove) ) {
    // Add it
    var myParams = {
      target: graphTargetList
    };
    var urlParams = {};
    Ext.apply(urlParams, defaultGraphParams);
    if (options && options.defaultParams) {
      Ext.apply(urlParams, options.defaultParams);
    }
    Ext.apply(urlParams, GraphSize);
    Ext.apply(urlParams, myParams);

	switch (viz_type) {
	case 'graphite':
		var record = new GraphRecord({
		  target: graphTargetString,
		  params: myParams,
		  url: '/render?' + Ext.urlEncode(urlParams)
		});
		graphStore.add([record]);
		break;
	case 'd3':
		//var s = "" + target.substring(2);
		//s = s.split('.').join('');
		var id = D3GraphID++;
		var sid = "graph_" + id;
	
		var record = new GraphRecord({
		  target: graphTargetString,
		  url: sid,
		  params: myParams,
		});
		graphStore.add([record]);
		G.makeRequest(urlParams, sid, record, d3GraphDone);
		break;
	case 'cubism':
		toggleCubismMetric(graphTargetString.split('=')[1]);
		break;
	}
  }
}

function d3GraphDone(text, sid, record) {
	/*console.log(text);
	console.log(targets);
	var s = "" + targets[0].substring(2);
	s = s.split('.').join('');
	var string = "#" + s;
	console.log(s);*/
	
	switch (graphType) {
	case 1:
		var graph = d3.select("#" + sid).append("div")
		.attr("id", sid + "_g3lgdiv")  // Stands for "g3 line graph div".
	    	.style("width", "500")
	        .style("height", "300")
		.style("background-color", "white")
		.style("visibility", "visible")    
	        var g = new G3.Histogram(sid + "_g3lgdiv", text);//, graph);
	        D3Graphs[D3Graphs.length] = g;
	        record.graph = g;
		break;	
        default:
  		var graph = d3.select("#" + sid).append("div")
		.attr("id", sid + "_g3lgdiv")  // Stands for "g3 line graph div".
	    	.style("width", "500")
	        .style("height", "300")
		.style("background-color", "white")
		.style("visibility", "visible")    
	        var g = new G3.LineGraph(sid + "_g3lgdiv", text, graph);
	        D3Graphs[D3Graphs.length] = g;
	        record.graph = g;
		break;
	}
}

function d3UpdateGraph(text, graph) {
	graph.setData(text);
}

function updateGraphRecords() {

	  graphStore.each(function () {
		var params = {};
		Ext.apply(params, defaultGraphParams);
		Ext.apply(params, this.data.params);
		Ext.apply(params, GraphSize);
		params.uniq = Math.random();
		if (params.title === undefined && params.target.length == 1) {
		  params.title = params.target[0];
		}
		
		switch (viz_type) {
		case 'graphite':
			this.set('url', '/render?' + Ext.urlEncode(params));
			break;
		case 'd3':
			if (this.graph != undefined) {
				G.makeUpdateRequest(params, this.graph, d3UpdateGraph);
			}
			else {
				G.makeRequest(params, this.data.url, this, d3GraphDone);
			}
			break;
		case 'cubism':
			// Cubism handles updating on its own.
			break;
		}
	  });
}

function refreshGraphs() {
  updateGraphRecords();
  graphView.refresh();
  graphArea.getTopToolbar().get('last-refreshed-text').setText( (new Date()).format('g:i:s A') );
}

/*
function refreshGraph(index) {
  var node = graphView.getNode(index);
  var record = graphView.getRecord(node);
  record.data.params.uniq = Math.random();
  record.set('url', '/render?' + Ext.urlEncode(record.get('params')));

  // This refreshNode method only refreshes the record data, it doesn't re-render
  // the template. Which is pretty useless... It would be more efficient if we
  // could simply re-render the template. Need to see if thats feasible.
  //graphView.refreshNode(node);

  // This is *slightly* better than just calling refreshGraphs() because we're only
  // updating the URL of one graph, so caching should save us from re-rendering each
  // graph.
  //graphView.refresh();
}
*/

function updateAutoRefresh (newValue) {
  Ext.getCmp('auto-refresh-field').setValue(newValue);

  var value = parseInt(newValue);
  if ( isNaN(value) ) {
    return;
  }

  if (Ext.getCmp('auto-refresh-button').pressed) {
    stopTask(refreshTask);
    refreshTask.interval = value * 1000;
    startTask(refreshTask);
  } else {
    refreshTask.interval = value * 1000;
  }
}

/* Task management */
function stopTask(task) {
  if (task.running) {
    Ext.TaskMgr.stop(task);
    task.running = false;
  }
}

function startTask(task) {
  if (!task.running) {
    Ext.TaskMgr.start(task);
    task.running = true;
  }
}

/* Time Range management */
defaultGraphParams['from'].match(/([0-9]+)([^0-9]+)/);
var defaultRelativeQuantity = RegExp.$1;
var defaultRelativeUnits = RegExp.$2;
var TimeRange = {
  // Default to a relative time range
  type: 'relative',
  quantity: defaultRelativeQuantity,
  units: defaultRelativeUnits,
  // Absolute time range
  startDate: new Date(),
  startTime: "9:00 AM",
  endDate: new Date(),
  endTime: "5:00 PM"
};

function getTimeText() {
  if (TimeRange.type == 'relative') {
    return "Now showing the past " + TimeRange.quantity + ' ' + TimeRange.units;
  } else {
    var fmt = 'g:ia F jS Y';
    return "Now Showing " + TimeRange.startDate.format(fmt) + ' through ' + TimeRange.endDate.format(fmt);
  }
}

function updateTimeText() {
  graphArea.getTopToolbar().get('time-range-text').setText( getTimeText() );
}

function timeRangeUpdated() {
  if (TimeRange.type == 'relative') {
    var fromParam = '-' + TimeRange.quantity + TimeRange.units;
    var untilParam = 'now';
  } else {
    var fromParam = TimeRange.startDate.format('H:i_Ymd');
    var untilParam = TimeRange.endDate.format('H:i_Ymd');
  }
  defaultGraphParams.from = fromParam;
  defaultGraphParams.until = untilParam;
  saveDefaultGraphParams();

  graphStore.each(function () {
    this.data.params.from = fromParam;
    this.data.params.until = untilParam;
    if (viz_type === "d3") {
    	this.graph = undefined;
    }
  });
  updateTimeText();
  refreshGraphs();
}


function selectRelativeTime() {
  var quantityField = new Ext.form.TextField({
    fieldLabel: "Show the past",
    width: 90,
    allowBlank: false,
    regex: /\d+/,
    regexText: "Please enter a number",
    value: TimeRange.quantity
  });

  var unitField = new Ext.form.ComboBox({
    fieldLabel: "",
    width: 90,
    mode: 'local',
    editable: false,
    triggerAction: 'all',
    allowBlank: false,
    forceSelection: true,
    store: ['minutes', 'hours', 'days', 'weeks', 'months'],
    value: TimeRange.units
  });

  var win;

  function updateTimeRange() {
    TimeRange.type = 'relative';
    TimeRange.quantity = quantityField.getValue();
    TimeRange.units = unitField.getValue();
    win.close();
    timeRangeUpdated();
  }

  win = new Ext.Window({
    title: "Select Relative Time Range",
    width: 205,
    height: 130,
    resizable: false,
    modal: true,
    layout: 'form',
    labelAlign: 'right',
    labelWidth: 90,
    items: [quantityField, unitField],
    buttonAlign: 'center',
    buttons: [
      {text: 'Ok', handler: updateTimeRange},
      {text: 'Cancel', handler: function () { win.close(); } }
    ]
  });
  win.show();
}

function selectAbsoluteTime() {
  var startDateField = new Ext.form.DateField({
    fieldLabel: 'Start Date',
    width: 125,
    value: TimeRange.startDate || ''
  });

  var startTimeField = new Ext.form.TimeField({
    fieldLabel: 'Start Time',
    width: 125,
    allowBlank: false,
    increment: 30,
    value: TimeRange.startTime || ''
  });

  var endDateField = new Ext.form.DateField({
    fieldLabel: 'End Date',
    width: 125,
    value: TimeRange.endDate || ''
  });

  var endTimeField = new Ext.form.TimeField({
    fieldLabel: 'End Time',
    width: 125,
    allowBlank: false,
    increment: 30,
    value: TimeRange.endTime || ''
  });

  var win;

  function updateTimeRange() {
    TimeRange.type = 'absolute';
    TimeRange.startDate = new Date(startDateField.getValue().format('Y/m/d ') + startTimeField.getValue());
    TimeRange.startTime = startTimeField.getValue();
    TimeRange.endDate = new Date(endDateField.getValue().format('Y/m/d ') + endTimeField.getValue());
    TimeRange.endTime = endTimeField.getValue();
    win.close();
    timeRangeUpdated();
  }

  win = new Ext.Window({
    title: "Select Absolute Time Range",
    width: 225,
    height: 180,
    resizable: false,
    modal: true,
    layout: 'form',
    labelAlign: 'right',
    labelWidth: 70,
    items: [startDateField, startTimeField, endDateField, endTimeField],
    buttonAlign: 'center',
    buttons: [
      {text: 'Ok', handler: updateTimeRange},
      {text: 'Cancel', handler: function () { win.close(); } }
    ]
  });
  win.show();
}


/* Graph size stuff */
var GraphSize = {
  width: UI_CONFIG.default_graph_width,
  height: UI_CONFIG.default_graph_height
};

var rawData = {
	rawData: true
};


function editDefaultGraphParameters() {
  var editParams = Ext.apply({}, defaultGraphParams);
  removeUneditable(editParams);

  function applyParams() {
    var paramsString = Ext.getCmp('default-params-field').getValue();
    var params = Ext.urlDecode(paramsString);
    copyUneditable(defaultGraphParams, params);
    defaultGraphParams = params;
    saveDefaultGraphParams();
    refreshGraphs();
    win.close();
  }

  var paramsField = new Ext.form.TextField({
    id: 'default-params-field',
    region: 'center',
    value: Ext.urlEncode(editParams),
    listeners: {
      specialkey: function (field, e) {
                    if (e.getKey() == e.ENTER) {
                      applyParams();
                    }
                  },
      afterrender: function (field) { field.focus(false, 100); }
    }
  });

  var win = new Ext.Window({
    title: "Default Graph Parameters",
    width: 470,
    height: 87,
    layout: 'border',
    resizable: true,
    modal: true,
    items: [paramsField],
    buttonAlign: 'center',
    buttons: [
      {
        text: 'OK',
        handler: applyParams
      }, {
        text: 'Cancel',
        handler: function () { win.close(); }
      }
    ]
  });
  win.show();
}

function selectGraphSize() {
  var presetCombo = new Ext.form.ComboBox({
    fieldLabel: "Preset",
    width: 80,
    editable: false,
    forceSelection: true,
    triggerAction: 'all',
    mode: 'local',
    value: 'Custom',
    store: ['Custom', 'Small', 'Medium', 'Large'],
    listeners: {
      select: function (combo, record, index) {
                var w = "";
                var h = "";
                if (index == 1) { //small
                  w = 300;
                  h = 230;
                } else if (index == 2) { //medium
                  w = 400;
                  h = 300;
                } else if (index == 3) { //large
                  w = 500;
                  h = 400;
                }
                Ext.getCmp('width-field').setValue(w);
                Ext.getCmp('height-field').setValue(h);
              }
    }
  });

  var widthField = new Ext.form.TextField({
    id: 'width-field',
    fieldLabel: "Width",
    width: 80,
    regex: /\d+/,
    regexText: "Please enter a number",
    allowBlank: false,
    value: GraphSize.width || UI_CONFIG.default_graph_width
  });

  var heightField = new Ext.form.TextField({
    id: 'height-field',
    fieldLabel: "Height",
    width: 80,
    regex: /\d+/,
    regexText: "Please enter a number",
    allowBlank: false,
    value: GraphSize.height || UI_CONFIG.default_graph_height
  })

  var win;

  function resize() {
    GraphSize.width = defaultGraphParams.width = widthField.getValue();
    GraphSize.height = defaultGraphParams.height = heightField.getValue();
    saveDefaultGraphParams();
    win.close();
    refreshGraphs();
  }

  win = new Ext.Window({
    title: "Change Graph Size",
    width: 185,
    height: 160,
    resizable: false,
    layout: 'form',
    labelAlign: 'right',
    labelWidth: 80,
    items: [presetCombo, widthField, heightField],
    buttonAlign: 'center',
    buttons: [
      {text: 'Ok', handler: resize},
      {text: 'Cancel', handler: function () { win.close(); } }
    ]
  });
  win.show();
}

function doShare() {
  if (dashboardName == null) {
    Ext.Ajax.request({
      url: "/dashboard/create-temporary/",
      method: 'POST',
      params: {
        state: Ext.encode( getState() )
      },
      callback: function (options, success, response) {
                  var result = Ext.decode(response.responseText);
                  if (result.error) {
                    Ext.Msg.alert("Error", "There was an error saving this dashboard: " + result.error);
                  } else {
                    setDashboardName(result.name);
                    sendSaveRequest(result.name); // Resave the state with the proper dashboardName now
                    showShareWindow();
                  }
                }
    });
  } else {
    // Prompt the user to save their dashboard so they are aware only saved changes get shared
    Ext.Msg.show({
      title: "Save Dashboard And Share",
      msg: "You must save changes to your dashboard in order to share it.",
      buttons: Ext.Msg.OKCANCEL,
      fn: function (button) {
            if (button == 'ok') {
              sendSaveRequest(dashboardName);
              showShareWindow();
            }
          }
    });

  }
}

function showShareWindow() {
  var win = new Ext.Window({
    title: "Share Dashboard",
    width: 600,
    height: 125,
    layout: 'border',
    modal: true,
    items: [
      {
        xtype: "label",
        region: 'north',
        style: "text-align: center;",
        text: "You can use this URL to access the current dashboard."
      }, {
        xtype: 'textfield',
        region: 'center',
        value: dashboardURL,
        editable: false,
        style: "text-align: center; font-size: large;",
        listeners: {
          afterrender: function (field) { field.selectText(); }
        }
      }
    ],
    buttonAlign: 'center',
    buttons: [
      {text: "Close", handler: function () { win.close(); } }
    ]
  });
  win.show();
}

/* Other stuff */
var targetGrid;
var activeMenu;

function graphCtx(graphView, graphIndex, element, evt) {
  d3_menu_force = true;
  graphClicked(graphView, graphIndex, element, evt);
  d3_menu_force = false;
}

function graphClicked(graphView, graphIndex, element, evt) {
  if (viz_type == 'd3' && !d3_menu_force) return;
  Ext.get('merge').hide();
  var record = graphStore.getAt(graphIndex);
  if (!record) {
    return;
  }

  if (justClosedGraph) {
    justClosedGraph = false;    
    return;
  }

  if ( (activeMenu != null) && (selectedRecord == record) ) {
    activeMenu.destroy();
    activeMenu = null;
    return;
  }

  selectedRecord = record; // global state hack for graph options API

  var menu;
  var menuItems = [];
  function applyChanges (field, e) {
    if (e.getKey() != e.ENTER) {
      return;
    }
    var targets = [];
    Ext.each(menuItems, function (field) {
      if ((!field.getXType) || field.getXType() != 'textfield') {        
        return;
      }
      if (field.initialConfig.isTargetField) {
        targets.push( field.getValue() );
      } else {
        var newParams = Ext.urlDecode( field.getValue() );
        copyUneditable(record.data.params, newParams);
        record.data.params = newParams;
      }
    });          

    record.data.target = Ext.urlEncode( {target: targets} );
    record.data.params.target = targets;

    refreshGraphs();
    menu.destroy();
    
  }
  /* Inline store definition hackery*/
  var functionsButton;
  var targets = record.data.params.target;
  targets = map(targets, function (t) { return {target: t}; });
  var targetStore = new Ext.data.JsonStore({
    fields: ['target'],
    data: targets,
    listeners: {
      update: function (thisStore, record, operation) {
        var targets = [];
        thisStore.each(function (rec) { targets.push(rec.data.target); });
        selectedRecord.data.params.target = targets;
        selectedRecord.data.target = Ext.urlEncode({target: targets});
        refreshGraphs();
      }
    }
  });

  var buttonWidth = 150;
  var rowHeight = 21;
  var maxRows = 6;
  var frameHeight = 5;
  var gridWidth = (buttonWidth * 3) + 2;
  var gridHeight = (rowHeight * Math.min(targets.length, maxRows)) + frameHeight;

  targetGrid = new Ext.grid.EditorGridPanel({
    //frame: true,
    width: gridWidth,
    height: gridHeight,
    store: targetStore,
    hideHeaders: true,
    viewConfig: {markDirty: false},
    colModel: new Ext.grid.ColumnModel({
      columns: [
        {
          id: 'target',
          header: 'Target',
          dataIndex: 'target',
          width: gridWidth - 22,
          editor: {xtype: 'textfield'}
        }
      ]
    }),
    selModel: new Ext.grid.RowSelectionModel({
      singleSelect: false,
      listeners: {
        selectionchange: function (thisSelModel) {
          functionsButton.setDisabled(thisSelModel.getCount() == 0);
        }
      }
    }),
    clicksToEdit: 2,
    listeners: {
      afterrender: function (thisGrid) {
        thisGrid.getSelectionModel().selectFirstRow.defer(50, thisGrid.getSelectionModel());
      }
    }
  });
  menuItems.push(targetGrid);

  /* Setup our menus */
  var functionsMenu = new Ext.menu.Menu({
    allowOtherMenus: true,
    items: createFunctionsMenu().concat([ {text: 'Remove Outer Call', handler: removeOuterCall} ])
  });

  functionsButton = new Ext.Button({
    text: 'Apply Function',
    disabled: true,
    width: buttonWidth,
    handler: function (thisButton) {
               if (functionsMenu.isVisible()) {
                 functionsMenu.hide();
               } else {
                 operationsMenu.hide();
                 optionsMenu.doHide(); // private method... yuck
                 functionsMenu.show(thisButton.getEl());
               }
             }
  });


  var optionsMenuConfig = createOptionsMenu(); // defined in composer_widgets.js
  optionsMenuConfig.allowOtherMenus = true;
  var optionsMenu = new Ext.menu.Menu(optionsMenuConfig);
  optionsMenu.on('hide', function () { menu.hide(); });
  updateCheckItems();

  var operationsMenu = new Ext.menu.Menu({
    allowOtherMenus: true,
    items: [{
      xtype: 'button',
      fieldLabel: "<span style='visibility: hidden'>",
      text: 'Breakout',
      width: 100,
      handler: function () { menu.destroy(); breakoutGraph(record); }
    }, {
      xtype: 'button',
      fieldLabel: "<span style='visibility: hidden'>",
      text: 'Clone',
      width: 100,
      handler: function () { menu.destroy(); cloneGraph(record); }
    }]
  });

  var buttons = [functionsButton];

  buttons.push({
    xtype: 'button',
    text: "Render Options",
    width: buttonWidth,
    handler: function (thisButton) {
               if (optionsMenu.isVisible()) {
                 optionsMenu.doHide(); // private method... yuck (no other way to hide w/out trigging hide event handler)
               } else {
                 operationsMenu.hide();
                 functionsMenu.hide();
                 optionsMenu.show(thisButton.getEl());
               }
             }
  });

  buttons.push({
    xtype: 'button',
    text: "Graph Operations",
    width: buttonWidth,
    handler: function (thisButton) {
               if (operationsMenu.isVisible()) {
                 operationsMenu.hide();
               } else {
                 optionsMenu.doHide(); // private method... yuck
                 functionsMenu.hide();
                 operationsMenu.show(thisButton.getEl());
               }
             }
  });

  menuItems.push({
    xtype: 'panel',
    layout: 'hbox',
    items: buttons
  });

  menu = new Ext.menu.Menu({
    layout: 'anchor',
    allowOtherMenus: true,
    items: menuItems
  });
  activeMenu = menu;
  var position = evt.getXY();
  position[0] -= (buttonWidth * 1.5) + 10; //horizontally center menu with the mouse
  menu.showAt(position);
  menu.get(0).focus(false, 50);
  menu.keyNav.disable();
  menu.on('hide', function () {
                    var graphMenuParams = Ext.getCmp('graphMenuParams');
                    if (graphMenuParams) {
                      graphMenuParams.destroy();
                    }
                  }
  );
  menu.on('destroy', function () {
                       optionsMenu.destroy();
                       operationsMenu.destroy();
                       functionsMenu.destroy();
                     }
  );

}



function removeUneditable (obj) {
  Ext.each(NOT_EDITABLE, function (p) {
    delete obj[p];
  });
  return obj;
}

function copyUneditable (src, dst) {
  Ext.each(NOT_EDITABLE, function (p) {
    if (src[p] === undefined) {
      delete dst[p];
    } else {
      dst[p] = src[p];
    }
  });
}

function breakoutGraph(record) {
  /* We have to gather some context from the
     graph target's expressions so we can reapply
     functions after the expressions get expanded. */
  var pathExpressions = [];
  var exprInfo = {};

  try {
    Ext.each(record.data.params.target, function(target) {
      var exprsInThisTarget = 0;
      map(target.split(','), function (arg) {
        var arglets = arg.split('(');
        map(arglets[arglets.length-1].split(')'), function (expr) {
          expr = expr.replace(/^\s*(.+?)\s*$/, '$1');
          if (expr.length == 0 || expr[0] == '"' || expr[0] == "'") return;

          if (expr.match(/[a-z].*\..*[a-z]/i)) {
            exprsInThisTarget++;
            if (exprsInThisTarget > 1) {
              throw 'arrr!';
            }

            pathExpressions.push(expr);
            var i = target.indexOf(expr);
            exprInfo[expr] = {
              expr: expr,
              pre: target.substr(0, i),
              post: target.substr(i + expr.length)
            }

          }   

        }); //map arglets
      }); //map args
    }); //each target
  } catch (err) {
    Ext.Msg.alert("Graph contains unbreakable target", "Graph targets containing more than one metric expression cannot be broken out.");
    return;
  }

  Ext.Ajax.request({
    url: '/metrics/expand/',
    params: {
      groupByExpr: '1',
      leavesOnly: '1',
      query: pathExpressions
    },
    callback: function (options, success, response) {
                var responseObj = Ext.decode(response.responseText);
                graphStore.remove(record);
                for (var expr in responseObj.results) {
                  var pre = exprInfo[expr].pre;
                  var post = exprInfo[expr].post;
                  map(responseObj.results[expr], function (metricPath) {
                    metricPath = pre + metricPath + post;
                    graphAreaToggle(metricPath, {dontRemove: true, defaultParams: record.data.params});
                  });
                }
              }
  });
}


function cloneGraph(record) {
  var index = graphStore.indexOf(record);
  var clone = cloneGraphRecord(record);
  graphStore.insert(index+1, [clone]);
  refreshGraphs();
}

function cloneGraphRecord(record) {
  //ensure we are working with copies, not references
  var props = {
    url: record.data.url,
    target: record.data.target,
    params: Ext.apply({}, record.data.params)
  };
  props.params.target = Ext.urlDecode(props.target).target;
  if (typeof props.params.target == "string") {
    props.params.target = [props.params.target];
  }
  return new GraphRecord(props);
}

function removeAllGraphs() {
  if (CONFIRM_REMOVE_ALL) {
    /*
    Ext.Msg.confirm(
      "Are you sure?",
      "Are you sure you want to remove all the graphs?",
      function (choice) {
        if (choice == 'yes') {
          graphStore.removeAll();
          refreshGraphs();
        }
      }
    );
    */
    var win;
    win = new Ext.Window({
      title: "Remove All Graphs",
      width: 200,
      height: 120,
      layout: 'vbox',
      layoutConfig: { align: 'center' },
      items: [
        {
          xtype: 'label',
          text: "Are You Sure?",
          style: "font-size: large;"
        }, {
          id: 'always-ask-me',
          xtype: 'checkbox',
          boxLabel: "Always Ask Me",
          name: "ask-me",
          inputValue: "yes",
          checked: true
        }
      ],
      buttonAlign: 'center',
      buttons: [
        {
          text: "Yes",
          handler: function () {
                     if (Ext.getCmp('always-ask-me').getValue()) {
                       CONFIRM_REMOVE_ALL = true;
                       cookieProvider.set('confirm-remove-all', 'true');
                     } else {
                       CONFIRM_REMOVE_ALL = false;
                       cookieProvider.set('confirm-remove-all', 'false');
                     }
                     graphStore.removeAll();
                     refreshGraphs();
                     win.close();
                   }
        }, {
          text: "No",
          handler: function () { win.close(); }
        }
      ]
    });
    win.show();
  } else {
    graphStore.removeAll();
    refreshGraphs();
  }
}


function toggleToolbar() {
  var tbar = graphArea.getTopToolbar();
  tbar.setVisible( ! tbar.isVisible() );
  graphArea.doLayout();
}

function toggleNavBar() {
  navBar.toggleCollapse(true);
}

function focusCompleter() {
  if (metricSelectorTextField) metricSelectorTextField.focus(false, 50);
}

/* Keyboard shortcuts */
var keyEventHandlers = {
  toggle_toolbar: toggleToolbar,
  toggle_metrics_panel: toggleNavBar,
  give_completer_focus: focusCompleter,
  erase_all_graphs: function () {
      graphStore.removeAll();
      refreshGraphs();
      graphStoreUpdated();
    },
  completer_add_metrics: function () {
      if (metricSelectorGrid) {
        metricSelectorGrid.getStore().each(function (record) {
          if (record.data.path[ record.data.path.length - 1] != '.') {
            graphAreaToggle(record.data.path, {dontRemove: true});
          }
        });
        focusCompleter(); 
      }
    },
  completer_del_metrics: function () {
      if (metricSelectorGrid) {
        metricSelectorGrid.getStore().each(function (record) {
          graphAreaToggle(record.data.path, {onlyRemove: true});
        });
        focusCompleter();
      }
    },
  save_dashboard: function () {
      if (dashboardName == null) {
        saveDashboard();
      } else {
        sendSaveRequest(dashboardName);
      }
    }
};

var specialKeys = {
  space: 32,
  enter: Ext.EventObject.ENTER,
  backspace: Ext.EventObject.BACKSPACE
};

var keyMapConfigs = [];

for (var event_name in UI_CONFIG.keyboard_shortcuts) {
  var config = {handler: keyEventHandlers[event_name]};
  if (!config.handler) {
    continue;
  }
  var keyString = UI_CONFIG.keyboard_shortcuts[event_name];
  var keys = keyString.split('-');
  config.ctrl = keys.indexOf('ctrl') > -1;
  config.alt = keys.indexOf('alt') > -1;
  config.shift = keys.indexOf('shift') > -1;
  config.key = keys[keys.length - 1];
  if (specialKeys[config.key]) {
    config.key = specialKeys[config.key];
  }
  keyMapConfigs.push(config);
}

var keyMap = new Ext.KeyMap(document, keyMapConfigs);


/* Dashboard functions */
function saveDashboard() {
  Ext.Msg.prompt(
    "Save Dashboard",
    "Enter the name to save this dashboard as",
    function (button, text) {
      if (button == 'ok') {
        setDashboardName(text);
        sendSaveRequest(text);
      }
    },
    this,
    false,
    (dashboardName) ? dashboardName : ""
  );
}

function sendSaveRequest(name) {
  Ext.Ajax.request({
    url: "/dashboard/save/" + name,
    method: 'POST',
    params: {
      state: Ext.encode( getState() )
    },
    success: function (response) {
               var result = Ext.decode(response.responseText);
               if (result.error) {
                 Ext.Msg.alert("Error", "There was an error saving this dashboard: " + result.error);
               }
             },
    failure: failedAjaxCall
  });
}

function sendLoadRequest(name) {
  Ext.Ajax.request({
    url: "/dashboard/load/" + name,
    success: function (response) {
               var result = Ext.decode(response.responseText);
               if (result.error) {
                 Ext.Msg.alert("Error Loading Dashboard", result.error);
               } else {
                 applyState(result.state);
               }
             },
    failure: failedAjaxCall
  });
}

function getState() {
  var graphs = [];
  graphStore.each(
    function (record) {
      graphs.push([
        record.data.id,
        record.data.target,
        record.data.params,
        record.data.url
      ]);
    }
  );

  return {
    name: dashboardName,
    timeConfig: TimeRange,
    refreshConfig: {
      enabled: Ext.getCmp('auto-refresh-button').pressed,
      interval: refreshTask.interval
    },
    graphSize: GraphSize,
    defaultGraphParams: defaultGraphParams,
    graphs: (viz_type == "cubism") ? cubism_metrics : graphs
  };
}

function applyState(state) {
  setDashboardName(state.name);

  //state.timeConfig = {type, quantity, units, startDate, startTime, endDate, endTime}
  var timeConfig = state.timeConfig
  TimeRange.type = timeConfig.type;
  TimeRange.quantity = timeConfig.quantity;
  TimeRange.units = timeConfig.units;
  TimeRange.startDate = new Date(timeConfig.startDate);
  TimeRange.startTime = timeConfig.startTime;
  TimeRange.endDate = new Date(timeConfig.endDate);
  TimeRange.endTime = timeConfig.endTime;
  updateTimeText();

  //state.refreshConfig = {enabled, interval}
  var refreshConfig = state.refreshConfig;
  if (refreshConfig.enabled) {
    stopTask(refreshTask);
    startTask(refreshTask);
    Ext.getCmp('auto-refresh-button').toggle(true);
  } else {
    stopTask(refreshTask);
    Ext.getCmp('auto-refresh-button').toggle(false);
  }
  //refreshTask.interval = refreshConfig.interval;
  updateAutoRefresh(refreshConfig.interval / 1000);

  //state.graphSize = {width, height}
  var graphSize = state.graphSize;
  GraphSize.width = graphSize.width;
  GraphSize.height = graphSize.height;

  //state.defaultGraphParams = {...}
  defaultGraphParams = state.defaultGraphParams || originalDefaultGraphParams;

  if (viz_type == "cubism") {
  		cubism_metrics = [];
  		for (var i = 0; i < state.graphs.length; ++i) {
  			toggleCubismMetric(state.graphs[i]);
  		}
  }
  else {
	  //state.graphs = [ [id, target, params, url], ... ]
	  graphStore.loadData(state.graphs);
	  refreshGraphs();
  }
  
}

function deleteDashboard(name) {
  Ext.Ajax.request({
    url: "/dashboard/delete/" + name,
    success: function (response) {
      var result = Ext.decode(response.responseText);
      if (result.error) {
        Ext.Msg.alert("Error", "Failed to delete dashboard '" + name + "': " + result.error);
      } else {
        Ext.Msg.alert("Dashboard Deleted", "The " + name + " dashboard was deleted successfully.");
      }
    },
    failure: failedAjaxCall
  });
}

function setDashboardName(name) {
  dashboardName = name;
  var saveButton = Ext.getCmp('dashboard-save-button');

  if (name == null) {
    dashboardURL = null;
    document.title = "untitled - Graphite Dashboard";
    navBar.setTitle("untitled");
    saveButton.setText("Save");
    saveButton.disable();
  } else {
    var urlparts = location.href.split('/');
    var i = urlparts.indexOf('dashboard');
    if (i == -1) {
      Ext.Msg.alert("Error", "urlparts = " + Ext.encode(urlparts) + " and indexOf(dashboard) = " + i);
      return;
    }
    urlparts = urlparts.slice(0, i+1);
    urlparts.push( encodeURI(name) )
    dashboardURL = urlparts.join('/');

    document.title = name + " - Graphite Dashboard";
    navBar.setTitle(name + " - (" + dashboardURL + ")");
    saveButton.setText('Save "' + name + '"');
    saveButton.enable();
  }
}

function failedAjaxCall(response, options) {
  Ext.Msg.alert(
    "Ajax Error",
    "Ajax call failed, response was :" + response.responseText
  );
}

var configure_ui_win;
function configureUI() {

  if (configure_ui_win) {
    configure_ui_win.close();
  }

  function updateOrientation() {
    if (Ext.getCmp('navbar-left-radio').getValue()) {
      updateNavBar('west');
    } else {
      updateNavBar('north');
    }
    configure_ui_win.close();
    configure_ui_win = null;
  }

  configure_ui_win = new Ext.Window({
    title: "Configure UI",
    layout: 'form',
    width: 300,
    height: 125,
    labelWidth: 120,
    labelAlign: 'right',
    items: [
      {
        id: 'navbar-left-radio',
        xtype: "radio",
        fieldLabel: "Navigation Mode",
        boxLabel: "Tree (left nav)",
        name: "navbar-position",
        inputValue: "left",
        checked: (NAV_BAR_REGION == 'west')
      }, {
        id: 'navbar-top-radio',
        xtype: "radio",
        fieldLabel: "",
        boxLabel: "Completer (top nav)",
        name: "navbar-position",
        inputValue: "top",
        checked: (NAV_BAR_REGION == 'north')
      }
    ],
    buttons: [
      {text: 'Ok', handler: updateOrientation},
      {text: 'Cancel', handler: function () { configure_ui_win.close(); configure_ui_win = null; } }
    ]
  });
  configure_ui_win.show();
}

function updateNavBar(region) {
  if (region == NAV_BAR_REGION) {
    return;
  }
  cookieProvider.set('navbar-region', region);
  Ext.Msg.alert('Cookie Updated', "You must refresh the page to update the nav bar's location.");
  //TODO prompt the user to save their dashboard and refresh for them

  NAV_BAR_REGION = region;
}

// Dashboard Finder
function showDashboardFinder() {
  var win;
  var dashboardsList;
  var queryField;
  var dashboardsStore = new Ext.data.JsonStore({
    url: "/dashboard/find/",
    method: 'GET',
    params: {query: "e"},
    fields: ['name'],
    root: 'dashboards',
    listeners: {
      beforeload: function (store) {
                    store.setBaseParam('query', queryField.getValue());
                  }
    }
  });

  function openSelected() {
    var selected = dashboardsList.getSelectedRecords();
    if (selected.length > 0) {
      sendLoadRequest(selected[0].data.name);
    }
    win.close();
  }

  function deleteSelected() {
    var selected = dashboardsList.getSelectedRecords();
    if (selected.length > 0) {
      var record = selected[0];
      var name = record.data.name;

      Ext.Msg.confirm(
       "Delete Dashboard",
        "Are you sure you want to delete the " + name + " dashboard?",
        function (button) {
          if (button == 'yes') {
            deleteDashboard(name);
            dashboardsStore.remove(record);
            dashboardsList.refresh();
          }
        }
      );
    }
  }

  dashboardsList = new Ext.list.ListView({
    columns: [
      {header: 'Dashboard', width: 1.0, dataIndex: 'name', sortable: false}
    ],
    columnSort: false,
    emptyText: "No dashboards found",
    hideHeaders: true,
    listeners: {
      selectionchange: function (listView, selections) {
                         if (listView.getSelectedRecords().length == 0) {
                           Ext.getCmp('finder-open-button').disable();
                           Ext.getCmp('finder-delete-button').disable();
                         } else {
                           Ext.getCmp('finder-open-button').enable();
                           Ext.getCmp('finder-delete-button').enable();
                         }
                       },

      dblclick: function (listView, index, node, e) {
                  var record = dashboardsStore.getAt(index);
                  sendLoadRequest(record.data.name);
                  win.close();
                }
    },
    overClass: '',
    region: 'center',
    reserveScrollOffset: true,
    singleSelect: true,
    store: dashboardsStore,
    style: "background-color: white;"
  });

  var lastQuery = null;
  var queryUpdateTask = new Ext.util.DelayedTask(
    function () {
      var currentQuery = queryField.getValue();
      if (lastQuery != currentQuery) {
        dashboardsStore.load();
      }
      lastQuery = currentQuery;
    }
  );

  queryField = new Ext.form.TextField({
    region: 'south',
    emptyText: "filter dashboard listing",
    enableKeyEvents: true,
    listeners: {
      keyup: function (field, e) {
                  if (e.getKey() == e.ENTER) {
                    sendLoadRequest(field.getValue());
                    win.close();
                  } else {
                    queryUpdateTask.delay(FINDER_QUERY_DELAY);
                  }
                }
    }
  });

  win = new Ext.Window({
    title: "Dashboard Finder",
    width: 400,
    height: 500,
    layout: 'border',
    modal: true,
    items: [
      dashboardsList,
      queryField
    ],
    buttons: [
      {
        id: 'finder-open-button',
        text: "Open",
        disabled: true,
        handler: openSelected
      }, {
        id: 'finder-delete-button',
        text: "Delete",
        disabled: true,
        handler: deleteSelected
      }, {
        text: "Close",
        handler: function () { win.close(); }
      }
    ]
  });
  dashboardsStore.load();
  win.show();
}

/* Graph Options API (to reuse createOptionsMenu from composer_widgets.js) */
function updateGraph() {
  refreshGraphs();
  var graphMenuParams = Ext.getCmp('graphMenuParams');
  if (graphMenuParams) {
    var editParams = Ext.apply({}, selectedRecord.data.params);
    removeUneditable(editParams);
    graphMenuParams.setValue( Ext.urlEncode(editParams) );
  }
}

function getParam(param) {
  return selectedRecord.data.params[param];
}

function setParam(param, value) {
  selectedRecord.data.params[param] = value;
  selectedRecord.commit();
}

function removeParam(param) {
  delete selectedRecord.data.params[param];
  selectedRecord.commit();
}


/* Target Functions API (super-ghetto) */
function addTargetToSelectedGraph(target) {
  selectedRecord.data.params.target.push(target);
  selectedRecord.data.target = Ext.urlEncode({target: selectedRecord.data.params.target});
}

function removeTargetFromSelectedGraph(target) {
  selectedRecord.data.params.target.remove(target);
  selectedRecord.data.target = Ext.urlEncode({target: selectedRecord.data.params.target});
}

function getSelectedTargets() {
  if (targetGrid) {
    return map(targetGrid.getSelectionModel().getSelections(), function (r) {
      return r.data.target;
    });
  }
  return [];
}

function applyFuncToEach(funcName, extraArg) {

  function applyFunc() {
    Ext.each(targetGrid.getSelectionModel().getSelections(),
      function (record) {
        var target = record.data.target;
        var newTarget;
        var targetStore = targetGrid.getStore();

        targetStore.remove(record);
        removeTargetFromSelectedGraph(target);

        if (extraArg) {
          if (funcName == 'mostDeviant') { //SPECIAL CASE HACK
            newTarget = funcName + '(' + extraArg + ',' + target + ')';
          } else {
            newTarget = funcName + '(' + target + ',' + extraArg + ')';
          }
        } else {
          newTarget = funcName + '(' + target + ')';
        }

        // Add newTarget to selectedRecord
        targetStore.add([ new targetStore.recordType({target: newTarget}, newTarget) ]);
        addTargetToSelectedGraph(newTarget);
        targetGrid.getSelectionModel().selectRow(targetStore.findExact('target', newTarget), true);
      }
    );
    refreshGraphs();
  }
  return applyFunc;
}

function applyFuncToEachWithInput (funcName, question, options) {
  if (options == null) {
    options = {};
  }

 function applyFunc() {
    Ext.MessageBox.prompt(
      "Input Required", //title
      question, //message
      function (button, inputValue) { //handler
        if (button == 'ok' && (options.allowBlank || inputValue != '')) {
          if (options.quote) {
            inputValue = '"' + inputValue + '"';
          }
          applyFuncToEach(funcName, inputValue)();
        }
      },
      this, //scope
      false, //multiline
      "" //initial value
    );
  }
  applyFunc = applyFunc.createDelegate(this);
  return applyFunc;
}

function applyFuncToAll (funcName) {
  function applyFunc() {
    var args = getSelectedTargets().join(',');
    var newTarget = funcName + '(' + args + ')';
    var targetStore = targetGrid.getStore();

    Ext.each(targetGrid.getSelectionModel().getSelections(),
      function (record) {
        targetStore.remove(record);
        removeTargetFromSelectedGraph(record.data.target);
      }
    );
    targetStore.add([ new targetStore.recordType({target: newTarget}, newTarget) ]);
    addTargetToSelectedGraph(newTarget);
    targetGrid.getSelectionModel().selectRow(targetStore.findExact('target', newTarget), true);
    refreshGraphs();
  }
  applyFunc = applyFunc.createDelegate(this);
  return applyFunc;
}

function removeOuterCall() { // blatantly repurposed from composer_widgets.js (don't hate)
  Ext.each(targetGrid.getSelectionModel().getSelections(), function (record) {
    var target = record.data.target;
    var targetStore = targetGrid.getStore();
    var args = [];
    var i, c;
    var lastArg = 0;
    var depth = 0;
    var argString = target.replace(/^[^(]+\((.+)\)/, "$1"); //First we strip it down to just args

    for (i = 0; i < argString.length; i++) {
      switch (argString.charAt(i)) {
        case '(': depth += 1; break;
        case ')': depth -= 1; break;
        case ',':
          if (depth > 0) { continue; }
          if (depth < 0) { Ext.Msg.alert("Malformed target, cannot remove outer call."); return; }
          args.push( argString.substring(lastArg, i).replace(/^\s+/, '').replace(/\s+$/, '') );
          lastArg = i + 1;
          break;
      }
    }
    args.push( argString.substring(lastArg, i) );

    targetStore.remove(record);
    selectedRecord.data.params.target.remove(target);

    Ext.each(args, function (arg) {
      if (!arg.match(/^([0123456789\.]+|".+")$/)) { //Skip string and number literals
        targetStore.add([ new targetStore.recordType({target: arg}) ]);
        selectedRecord.data.params.target.push(arg);
        targetGrid.getSelectionModel().selectRow(targetStore.findExact('target', arg), true);
      }
    });
  });
  refreshGraphs();
}

function saveDefaultGraphParams() {
  cookieProvider.set('defaultGraphParams', Ext.encode(defaultGraphParams));
}


/* Cookie stuff */
function getContextFieldCookie(field) {
  return cookieProvider.get(field);
}

function setContextFieldCookie(field, value) {
  cookieProvider.set(field, value);
}

/* Misc */
function uniq(myArray) {
  var uniqArray = [];
  for (var i=0; i<myArray.length; i++) {
    if (uniqArray.indexOf(myArray[i]) == -1) {
      uniqArray.push(myArray[i]);
    }
  }
  return uniqArray;
}

function map(myArray, myFunc) {
  var results = [];
  for (var i=0; i<myArray.length; i++) {
    results.push( myFunc(myArray[i]) );
  }
  return results;
}  
