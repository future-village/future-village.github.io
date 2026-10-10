// Both published world entrances share data and art at the deployment root.
export function worldPaths(moduleURL) {
  const directory = new URL('.', moduleURL);
  const root = new URL(directory.pathname.endsWith('/site/world/') ? '../../' : '../', directory);
  return {
    world: new URL('village_world.json', root).href,
    patrol: new URL('patrol.json', root).href,
    street: new URL('site/index.html', root).href,
    art: name => new URL('site/assets/art/' + name + '.png', root).href,
    householdArt: rel => /^rooms\/(?!(?:con|aux|nul|prn|com[1-9]|lpt[1-9])\/)[a-z0-9][a-z0-9-]{0,40}\/house\.(?:png|webp)$/.test(rel) ? new URL(rel, root).href : null,
    room: id => new URL('site/index.html#room=' + encodeURIComponent(id), root).href,
  };
}
