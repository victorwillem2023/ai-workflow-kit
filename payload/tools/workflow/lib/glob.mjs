// Tiny glob matcher (** and * and ?) so the workflow tool needs no packages. Paths use forward slashes.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += '.+^${}()|[]\\'.includes(c) ? '\\' + c : c;
  }
  return new RegExp('^' + re + '$');
}

export function matchesAny(path, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(path));
}
