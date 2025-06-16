import {
  allComponents,
  provideVSCodeDesignSystem,
  Checkbox,
  DataGrid,
} from "@vscode/webview-ui-toolkit";

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

function main() {
  // Set checkbox indeterminate state
  const checkbox = document.getElementById("basic-checkbox") as Checkbox;
  checkbox.indeterminate = true;

  const benchmarkStatisticsGrid = document.getElementById("dataset-statistics-grid") as DataGrid;
  benchmarkStatisticsGrid.rowsData = [
    {
      key: "问题类型",
      value: "50",
    },
    {
      key: "实例问题数量",
      value: "83",
    },
    {
      key: "代码仓库数量",
      value: "1",
    },
  ];

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
