import { DataGrid } from "@vscode/webview-ui-toolkit";

interface TableDataLoader {
  ( id: string ): void;
}

export let htmlComponents: {  [key: string]: string } = {};

export let dataLoaders: { [key: string]: TableDataLoader } = {};

function getTable(
  header: string,
  id: string,
  gridTemplateColumns: string
): string {
  return /*html*/ `
    <section class="component-container">
      <h2>${header}</h2>
      <section class="component-example">
        <vscode-data-grid id="${id}" grid-template-columns="${gridTemplateColumns}" aria-label="${header}">
        </vscode-data-grid>
      </section>
    </section>
  `;
}

function registerTableComponent(
  name: string,
  header: string,
  id: string,
  gridTemplateColumns: string,
  dataLoader: TableDataLoader
): void {
  const tableHtml = getTable(header, id, gridTemplateColumns);
  htmlComponents[name] = tableHtml;
  dataLoaders[id] = dataLoader;
}

registerTableComponent(
  "datasetStatistics",
  "Dataset Statistics",
  "dataset-statistics-grid",
  "1fr 1fr",
  () => {
    const datasetStatisticsGrid = document.getElementById("dataset-statistics-grid") as DataGrid;
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
  }
);

registerTableComponent(
  "datasetQuestionType",
  "Dataset Question types",
  "dataset-question-type-grid",
  "1fr 1fr",
  () => {
    const datasetQuestionTypeGrid = document.getElementById("dataset-question-type-grid") as DataGrid;
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
  }
);
