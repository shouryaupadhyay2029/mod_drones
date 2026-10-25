export const noLiveReplayImport = {
  meta: {
    type: 'problem',
    docs: { description: 'Only AAR screens may access ground-truth session replay.' },
    schema: [],
    messages: { aarOnly: 'The replay API exposes ground truth and may only be imported from src/app/aar/**.' },
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    const inAar = /\/src\/app\/aar\//.test(file);
    return {
      ImportDeclaration(node) {
        if (inAar) return;
        const source = String(node.source.value).replaceAll('\\', '/');
        const importsReplay = source.includes('/sim/debrief/replay') ||
          (source.includes('/sim/index') && node.specifiers.some((specifier) =>
            specifier.type === 'ImportSpecifier' && specifier.imported.name === 'createReplay'));
        if (importsReplay) context.report({ node, messageId: 'aarOnly' });
      },
    };
  },
};
