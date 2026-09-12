#!/usr/bin/env python3
"""Focused catalog/source audit. Requires Python 3 and Node; no network or dependencies.

Semantic review is not native-speaker certification. English-identical values below
are deliberately retained product/style names, established UI loans, or cognates.
Plural expression syntax/range checks do not certify linguistic plural rules.
"""
import collections
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
L10N = ROOT / 'l10n'
# Exact locale allowlists: a new untranslated value must be explicitly reviewed.
IDENTICAL = {
    'Retro': '*',
    'Versions': 'ca fr oc',
    'Experimental': 'ca es es_EC es_MX gl oc pt_BR pt_PT ro',
    'Redmond': 'ca cs da de de_DE eo es es_EC es_MX et_EE eu fi fr ga gl hr hu id is it nb nl oc pl pt_BR pt_PT ro sk sl sv sw tr ug uz vi',
    'Dock': 'ca da de de_DE el es es_EC es_MX fr gl it ja ko nb nl oc pt_BR pt_PT ro sv sw th tr vi zh_HK zh_TW',
    'Nextcloud Desktop': 'cs da de de_DE id nb ro sk sv',
    'Desktop': 'cs da de de_DE id it ro sk',
    'Apps': 'da de de_DE nl',
    'Type': 'da fr nb',
    'Download': 'da',
    'Team': 'da de de_DE nb nl sv',
    'Version %s': 'da de de_DE fr oc sv',
    'Nextcloud Version %s': 'da oc sv',
    'Standard': 'da de de_DE fr hr hu is it nb pl ro sv ug',
    'Browser': 'da de de_DE nl ro',
    'Name': 'de de_DE',
    'Details': 'de de_DE nl',
    'Desktop in Nextcloud': 'de de_DE',
    'Applications': 'fr',
    'Notifications': 'fr',
    'Maintenance': 'fr',
    'Desktop Files': 'ga gl hr hu id is it ja ka ko lo lt_LT lv mk mn nb nl oc pl pt_BR pt_PT ro ru sk sl sr sv sw th tr ug uk uz vi zh_CN zh_HK zh_TW',
    'Desktop Workspace': 'ga gl hr hu id is it ja ka ko lo lt_LT lv mk mn nb nl oc pl pt_BR pt_PT ro ru sk sl sr sv sw th tr ug uk uz vi zh_CN zh_HK zh_TW',
    'Clipboard': 'ro',
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f'Duplicate JSON/JS key: {key}'
        result[key] = value
    return result


def parse(text):
    return json.loads(text, object_pairs_hook=unique_object)


def placeholders(text):
    return collections.Counter(re.findall(
        r'\{[^{}]+\}|%(?:\d+\$)?[-+0 #]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[bcdeEfFgGiosuxX]', text))


files = sorted(L10N.glob('*.json'))
assert len(files) == 57, f'Expected 57 locales, got {len(files)}'
assert {p.stem for p in files} == {p.stem for p in L10N.glob('*.js')}
en = parse((L10N / 'en.json').read_text())['translations']
identical_count = 0
for path in files:
    data = parse(path.read_text())
    translations = data['translations']
    assert translations.keys() == en.keys(), path
    js_text = path.with_suffix('.js').read_text()
    js_map = parse(js_text[js_text.index('{'):js_text.rindex('}') + 1])
    assert js_map == translations, path
    for key, value in translations.items():
        values = value if isinstance(value, list) else [value]
        for item in values:
            assert isinstance(item, str) and item.strip(), (path, key)
            assert placeholders(key) == placeholders(item), (path, key, item)
            assert '\ufffd' not in item, (path, key, 'replacement character')
            if item == key and path.stem not in {'en', 'en_GB'}:
                permitted = IDENTICAL.get(key, '')
                assert permitted == '*' or path.stem in permitted.split(), (path, key, 'unreviewed English fallback')
                identical_count += 1
    for key in ['Move', 'Copy', 'Rename', 'Overwrite', 'Cancel', 'Item already exists',
                'Could not complete file operation.', 'Choose folder…']:
        assert key in translations, (path, key)
        if path.stem not in {'en', 'en_GB'}:
            assert translations[key] != key, (path, key, 'recent English fallback')

# Execute each registration in a fresh sandbox: parses JS and verifies exactly one
# registration, the app domain, complete map equality, and plural metadata equality.
node = r'''
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const dir = process.argv[1];
let count = 0;
for (const filename of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(`${dir}/${filename}`, 'utf8'));
  let calls = 0;
  vm.runInNewContext(fs.readFileSync(`${dir}/${filename.replace(/json$/, 'js')}`, 'utf8'), {
    OC: {L10N: {register(domain, translations, plural) {
      calls++;
      assert.equal(domain, 'desktop_workspace');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(translations)), data.translations);
      assert.equal(plural, data.pluralForm);
    }}}
  }, {timeout: 1000});
  assert.equal(calls, 1);
  const match = /^nplurals=(\d+);\s*plural=(.+);$/.exec(data.pluralForm);
  assert(match, filename);
  const total = Number(match[1]);
  assert(total > 0);
  const plural = new Function('n', `return Number(${match[2]});`);
  for (const n of [...Array(10001).keys(), 0.1, 1.5, 2.5, 100000, 1000000, 2000000]) {
    const value = plural(n);
    assert(Number.isInteger(value) && value >= 0 && value < total, `${filename}: n=${n}, plural=${value}`);
  }
  for (const value of Object.values(data.translations)) {
    if (Array.isArray(value)) assert.equal(value.length, total);
  }
  count++;
}
console.log(`JS syntax/registration/map/plural parity and plural expression range: ${count} PASS`);
'''
subprocess.run(['node', '-e', node, str(L10N)], check=True)

# Static literal call sites used by this app, including PHP $l->t and JS wrappers.
# Dynamic keys and native Nextcloud strings are not claimed as statically covered.
pattern = re.compile(r'''\b(?:t|tr|translate)\(\s*(?:['"]desktop_workspace['"]\s*,\s*)?(?P<quote>['"])(?P<key>(?:\\.|(?!(?P=quote)).)*?)(?P=quote)''')
source_keys = set()
missing = []
for directory in ['js', 'templates', 'lib']:
    for source in sorted((ROOT / directory).rglob('*')):
        if source.suffix not in {'.js', '.php'}:
            continue
        for match in pattern.finditer(source.read_text()):
            key = match['key'].replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\')
            if key == 'desktop_workspace':
                continue
            source_keys.add(key)
            if key not in en:
                missing.append((str(source.relative_to(ROOT)), key))
assert not missing, f'Missing active source keys: {missing}'
print(f'JSON/JS pairs: {len(files)}; keys per locale: {len(en)}; translation entries: {len(files) * len(en)} PASS')
print(f'Placeholder multisets/nonempty values/duplicate keys: PASS; classified non-English identical values: {identical_count}')
print(f'Active literal source keys: {len(source_keys)}; missing: {len(missing)} PASS')
