module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui', '@pane/ui'],
          config: '../../packages/ui/tamagui.config.cjs',
          logTimings: false,
        },
      ],
    ],
  };
};
