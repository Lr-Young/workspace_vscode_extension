import { DataGrid } from "@vscode/webview-ui-toolkit";
import { DataLoader, getTable } from "./common-component";

const header = "Dataset Statistics";
const id = "dataset-statistics-grid";
const gridTemplateColumns = "1fr 1fr";

export const datasetStatisticsHtml = getTable(header, id, gridTemplateColumns);

export const datasetStatisticsLoader: DataLoader = () => {
  const datasetStatisticsGrid = document.getElementById(id) as DataGrid;
  datasetStatisticsGrid.rowsData = [
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
};
