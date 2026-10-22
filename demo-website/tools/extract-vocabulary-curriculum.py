"""Read only: extract the source workbook to a transport JSON; never rewrite XLSX."""
import argparse, collections, hashlib, json
from pathlib import Path
import openpyxl
parser=argparse.ArgumentParser()
parser.add_argument('workbook'); parser.add_argument('output')
args=parser.parse_args()
w=openpyxl.load_workbook(args.workbook,read_only=True,data_only=True)
headers=['Curriculum ID','Lemma / Wort','Primary Level','Word Type ID','Article','Plural','Meaning EN','Theme IDs','Grammar IDs','Forms','Grammar Pattern','Example Sentence','Audio Ref','Learning Enabled','Review Status','Notes']
data=list(w['Vocabulary'].values)
if list(data[0])!=headers: raise ValueError('Unexpected Vocabulary columns; review the extractor')
rows=[dict(zip(headers,r)) for r in data[1:] if r and r[0]]
payload={'source':'langnation-curriculum','workbookSha256':hashlib.sha256(Path(args.workbook).read_bytes()).hexdigest(),'rows':rows}
Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'rows':len(rows),'statuses':dict(collections.Counter((r['Primary Level']+' / '+str(r['Review Status'])) for r in rows))},ensure_ascii=False))
