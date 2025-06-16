export function getTable(
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

export interface DataLoader {
  (): void;
}
