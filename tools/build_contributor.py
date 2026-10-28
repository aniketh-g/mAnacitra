"""Generate the hosted suggestion editor from the independent local editor."""
from pathlib import Path
import shutil
import json

ROOT = Path(__file__).resolve().parents[1]

def build(root=ROOT):
    root = Path(root)
    editor, source, output = root/'tools/local_editor', root/'tools/contributor', root/'docs/contribute'
    output.mkdir(parents=True, exist_ok=True)
    html = (editor/'index.html').read_text()
    main = html[html.index('<main>'):html.index('</main>')+7]
    main = main.replace('Reload from disk', 'Reset to published entry').replace('Save JSON', 'Submit suggestion')
    main = main.replace('Manual file edits are detected automatically. Changes here are saved only when you press Save.', 'Your proposal is reviewed before publication.')
    main = main.replace('<div id="form">', '<label>Why this change?<textarea id="suggestion-reason" maxlength="4000" placeholder="Explain your correction or cite supporting evidence."></textarea></label><div id="form">')
    (output/'index.html').write_text((source/'index.html').read_text().replace('<!--EDITOR-->', main))
    app = (editor/'app.js').read_text()
    def replace(old, new):
        nonlocal app
        if old not in app:
            raise ValueError('Local editor changed; update hosted adapter: '+old[:70])
        app = app.replace(old, new)
    replace('async function api(path,body){', 'async function api(path,body){if(window.Contributor)return window.Contributor.api(path,body);')
    replace("fetch('/options.json')", "fetch('options.json')")
    replace('Saved. Backup: ${result.backup}. Run make ${kind} to update the website.', 'Suggestion submitted. Follow its status in Suggestions & review.')
    replace('Loaded from disk. Save updates the source JSON; rebuild the website separately.', 'Editing a proposal based on the published entry. Submit it when ready.')
    replace('Unsaved changes · Public website is unchanged.', 'Unsubmitted proposal · Published data is unchanged.')
    replace("const preview=el('div');preview.className='preview';", "details.append(el('p','Vidyut previews are available in the local editor; your grammar input can still be submitted.'));return;const preview=el('div');preview.className='preview';")
    # Hosted editor does not poll a user's local files.
    lines=app.splitlines();polls=[line for line in lines if line.startswith('setInterval(async()=>')]
    if len(polls)!=1: raise ValueError('Expected one local file polling loop')
    app='\n'.join(line for line in lines if line not in polls)+'\nwindow.contributionDirty=()=>dirty;\n'
    (output/'app.js').write_text(app)
    style=(editor/'style.css').read_text().replace("url('/font.otf')", "url('../fonts/Shobhika-Regular.otf')").replace('url("/font.otf")','url("../fonts/Shobhika-Regular.otf")')
    (output/'style.css').write_text(style)
    options = json.loads((editor/'options.json').read_text())
    options['languages'] = json.loads((root/'data/languages.json').read_text())
    (output/'options.json').write_text(json.dumps(options, ensure_ascii=False))
    for name in ['contributor.js','contributor.css']: shutil.copy2(source/name,output/name)
    (output/'data').mkdir(exist_ok=True)
    for dataset in ['cities','countries','rivers']:
        shutil.copy2(root/f'data/names/{dataset}.json',output/f'data/{dataset}.json')
    print('Built hosted suggestion editor >', output)

if __name__=='__main__': build()
