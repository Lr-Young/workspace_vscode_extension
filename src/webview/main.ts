import {
  allComponents,
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
} from "@vscode/webview-ui-toolkit";

import { dataLoaders } from "../gui/components";

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

window.confirm("This is a confirmation dialog. Do you want to proceed?") &&
  console.log("User confirmed the action.");

function loadData(): void {
  for (const [id, dataLoader] of Object.entries(dataLoaders)) {
    const element = document.getElementById(id);
    if (element) {
      dataLoader(id);
    } else {
      console.warn(`No element found with id: ${id}`);
    }
  }
}

function main() {

  // Load data for all components that require it
  loadData();

  // Set checkbox indeterminate state
  const checkbox = document.getElementById("basic-checkbox") as Checkbox;
  checkbox.indeterminate = true;

  // Define default data grid
  const defaultDataGrid = document.getElementById("default-grid") as DataGrid;
  defaultDataGrid.rowsData = [
    {
      column1: "Cell Data",
      column2: "Cell Data",
      column3: "Cell Data",
      column4: "Cell Data",
    },
    {
      column1: "Cell Data",
      column2: "Cell Data",
      column3: "Cell Data",
      column4: "Cell Data",
    },
    {
      column1: "Cell Data",
      column2: "Cell Data",
      column3: "Cell Data",
      column4: "Cell Data",
    },
  ];

  // Define data grid with custom titles
  const basicDataGridList = document.querySelectorAll(".basic-grid") as NodeListOf<DataGrid>;
  for (const basicDataGrid of basicDataGridList) {
    basicDataGrid.rowsData = [
      {
        columnKey1: "Cell Data",
        columnKey2: "Cell Data",
        columnKey3: "Cell Data",
        columnKey4: "Cell Data",
      },
      {
        columnKey1: "Cell Data",
        columnKey2: "Cell Data",
        columnKey3: "Cell Data",
        columnKey4: "Cell Data",
      },
      {
        columnKey1: "Cell Data",
        columnKey2: "Cell Data",
        columnKey3: "Cell Data",
        columnKey4: "Cell Data",
      },
    ];
    basicDataGrid.columnDefinitions = [
      { columnDataKey: "columnKey1", title: "A Custom Header Title" },
      { columnDataKey: "columnKey2", title: "Custom Title" },
      { columnDataKey: "columnKey3", title: "Title Is Custom" },
      { columnDataKey: "columnKey4", title: "Another Custom Title" },
    ];
  }
}
