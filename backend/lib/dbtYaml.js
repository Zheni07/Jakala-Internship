function generateDbtYaml({ name, description, columns }) {
  return [
    'version: 2',
    '',
    'models:',
    `  - name: ${name}`,
    `    description: "${description || ''}"`,
    '    columns:',
    ...columns.map((col) => {
      const tests = [];
      if (!col.nullable) tests.push('not_null');
      if (col.unique) tests.push('unique');
      return [
        `      - name: ${col.name}`,
        `        description: "${col.description || ''}"`,
        `        data_type: ${col.type}`,
        ...(tests.length ? ['        tests:'].concat(tests.map((t) => `          - ${t}`)) : []),
      ].join('\n');
    }),
  ].join('\n');
}

module.exports = { generateDbtYaml };
