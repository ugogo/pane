module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@tamagui/babel-plugin',
      [
        'transform-imports',
        {
          'lucide-react': {
            transform: (importName) =>
              `lucide-react/dist/esm/icons/${toLucideIconFile(importName)}.mjs`,
            preventFullImport: true,
          },
        },
      ],
    ],
  };
};

function toLucideIconFile(importName) {
  if (!importName.endsWith('Icon')) {
    throw new Error(
      `Use Icon-suffixed lucide-react imports in the Windows app, received ${importName}.`,
    );
  }

  return importName
    .slice(0, -'Icon'.length)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .toLowerCase();
}
