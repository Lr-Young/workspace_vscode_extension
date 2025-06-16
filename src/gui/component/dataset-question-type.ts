import { DataGrid } from "@vscode/webview-ui-toolkit";
import { DataLoader, getTable } from "./common-component";

const header = "Dataset Question types";
const id = "dataset-question-type-grid";
const gridTemplateColumns = "1fr 1fr";

export const datasetQuestionTypeHtml = getTable(header, id, gridTemplateColumns);

export const datasetQuestionTypeLoader: DataLoader = () => {
  const datasetQuestionTypeGrid = document.getElementById(id) as DataGrid;
  datasetQuestionTypeGrid.rowsData = [
    {
      "question type": "question type 1",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 2",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 3",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 4",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 5",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 6",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 7",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 8",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 9",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 10",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 11",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 12",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 13",
      "placeholders": "placeholder 1, placeholder 2",
    },
    {
      "question type": "question type 14",
      "placeholders": "placeholder 1, placeholder 2",
    },
  ];
};
