//! Build-time adapter. JSON input is grammatical intent; history is engine output.
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read};
use vidyut_lipi::{Lipika, Scheme};
use vidyut_prakriya::{args::*, Prakriya, Vyakarana};

type Result<T> = std::result::Result<T, String>;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    input: Input,
    #[serde(default)] expected: Option<String>,
    #[serde(default)] variant: Option<usize>,
    #[serde(default)] chandasi: bool,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum Input {
    Basic { text: String, #[serde(default, alias = "artha")] meaning: String, #[serde(default)] avyaya: bool, #[serde(default)] nyap: bool },
    Krdanta { dhatu: Root, pratyaya: Suffix,
        #[serde(default)] artha: Option<KrtArtha>,
        #[serde(default)] lakara: Option<Lakara>,
        #[serde(default)] prayoga: Option<Prayoga> },
    Taddhitanta { stem: Box<Input>, pratyaya: String, #[serde(default)] artha: Option<TaddhitaArtha> },
    Samasa { samasa_type: Compound, members: Vec<Member>, #[serde(default)] stri: bool },
    Subanta { stem: Box<Input>, gender: Gender, case: Case, number: Number },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Root {
    aupadeshika: String,
    gana: Gana,
    #[serde(default)] antargana: Option<Antargana>,
    #[serde(default)] prefixes: Vec<String>,
    #[serde(default)] sanadi: Vec<Sanadi>,
    #[serde(default, alias = "meaning")] artha: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "type", content = "id", rename_all = "snake_case", deny_unknown_fields)]
enum Suffix { Krt(BaseKrt), Unadi(Unadi) }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Member { stem: Input, gender: Gender, case: Case, number: Number }
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum Gender { Masculine, Feminine, Neuter }
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum Case { Nominative, Accusative, Instrumental, Dative, Ablative, Genitive, Locative, Vocative }
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum Number { Singular, Dual, Plural }
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum Compound { Avyayibhava, Tatpurusha, Karmadharaya, Dvigu, Ekadeshin, Bahuvrihi, Dvandva, SamaharaDvandva }
impl Gender { fn arg(self) -> Linga { match self { Self::Masculine=>Linga::Pum, Self::Feminine=>Linga::Stri, Self::Neuter=>Linga::Napumsaka } } }
impl Case { fn arg(self) -> Vibhakti { match self { Self::Nominative=>Vibhakti::Prathama,Self::Accusative=>Vibhakti::Dvitiya,Self::Instrumental=>Vibhakti::Trtiya,Self::Dative=>Vibhakti::Caturthi,Self::Ablative=>Vibhakti::Panchami,Self::Genitive=>Vibhakti::Sasthi,Self::Locative=>Vibhakti::Saptami,Self::Vocative=>Vibhakti::Sambodhana } } }
impl Number { fn arg(self) -> Vacana { match self {Self::Singular=>Vacana::Eka,Self::Dual=>Vacana::Dvi,Self::Plural=>Vacana::Bahu} } }
impl Compound { fn arg(self)->SamasaType { match self {Self::Avyayibhava=>SamasaType::Avyayibhava,Self::Tatpurusha=>SamasaType::Tatpurusha,Self::Karmadharaya=>SamasaType::Karmadharaya,Self::Dvigu=>SamasaType::Dvigu,Self::Ekadeshin=>SamasaType::Ekadeshin,Self::Bahuvrihi=>SamasaType::Bahuvrihi,Self::Dvandva=>SamasaType::Dvandva,Self::SamaharaDvandva=>SamasaType::SamaharaDvandva} } }
fn slp(text:&str, lipi:&mut Lipika)->Result<String> {
    if text.trim().is_empty() {return Err("Empty Sanskrit text".into());}
    // Authored Sanskrit text is Devanagari. API enum ids remain exact SLP1 identifiers.
    if text.chars().any(|c| c.is_ascii_alphabetic()) {return Err(format!("Use Devanagari for Sanskrit text: {text}"));}
    let text=lipi.transliterate(text,Scheme::Devanagari,Scheme::Slp1);
    Slp1String::from(text.as_str()).map_err(|e|e.to_string())?;
    Ok(text)
}
fn stem(input:&Input, lipi:&mut Lipika, depth:usize)->Result<Pratipadika> {
    if depth>24 {return Err("Compound nesting exceeds 24 levels".into());}
    Ok(match input {
        Input::Basic{text,avyaya,nyap,..} => {
            if *avyaya && *nyap {return Err("basic: avyaya and nyap are mutually exclusive".into());}
            let s=Slp1String::from(slp(text,lipi)?.as_str()).map_err(|e|e.to_string())?;
            if *avyaya {Pratipadika::avyaya(s)} else if *nyap {Pratipadika::nyap(s)} else {Pratipadika::basic(s)}
        },
        Input::Krdanta{dhatu,pratyaya,artha,lakara,prayoga} => {
            let mut builder=Dhatu::builder().aupadeshika(&slp(&dhatu.aupadeshika,lipi)?).gana(dhatu.gana);
            if let Some(a)=dhatu.antargana {builder=builder.antargana(a);}
            let prefixes=dhatu.prefixes.iter().map(|s|slp(s,lipi)).collect::<Result<Vec<_>>>()?;
            let d=builder.prefixes(&prefixes).sanadi(&dhatu.sanadi).build().map_err(|e|e.to_string())?;
            let k=match pratyaya {Suffix::Krt(k)=>Krt::Base(*k),Suffix::Unadi(k)=>Krt::Unadi(*k)};
            let mut k=Krdanta::builder().dhatu(d).krt(k);
            if let Some(a)=artha {k=k.artha(*a);}
            if let Some(l)=lakara {k=k.lakara(*l);}
            if let Some(p)=prayoga {k=k.prayoga(*p);}
            k.build().map_err(|e|e.to_string())?.into()
        },
        Input::Taddhitanta{stem:s,pratyaya,artha} => {
            let suffix: Taddhita=serde_json::from_value(json!(pratyaya)).map_err(|e|e.to_string())?;
            let mut t=Taddhitanta::builder();
            t.pratipadika(stem(s,lipi,depth+1)?).taddhita(suffix);
            if let Some(a)=artha {t.artha(*a);}
            t.build().map_err(|e|e.to_string())?.into()
        },
        Input::Samasa{samasa_type,members,stri} => {
            if members.len()<2 {return Err("samasa requires at least two members".into());}
            let padas=members.iter().map(|m|Ok(Subanta::new(stem(&m.stem,lipi,depth+1)?,m.gender.arg(),m.case.arg(),m.number.arg()))).collect::<Result<Vec<_>>>()?;
            Samasa::builder().padas(padas).samasa_type(samasa_type.arg()).build().map_err(|e|e.to_string())?.with_stri(*stri).into()
        },
        Input::Subanta{..}=>return Err("An inflected subanta cannot be used as a stem; use the member's gender/case/number".into()),
    })
}
fn root_meaning(root: &Root, lipi: &mut Lipika) -> String {
    if let Some(artha) = &root.artha { return artha.clone(); }
    let key = lipi.transliterate(&root.aupadeshika, Scheme::Devanagari, Scheme::Slp1);
    let gana = match root.gana {
        Gana::Bhvadi=>1, Gana::Adadi=>2, Gana::Juhotyadi=>3, Gana::Divadi=>4,
        Gana::Svadi=>5, Gana::Tudadi=>6, Gana::Rudhadi=>7, Gana::Tanadi=>8,
        Gana::Kryadi=>9, Gana::Curadi=>10, Gana::Kandvadi=>11,
    };
    let mut meanings = Vec::new();
    for line in include_str!("../data/dhatupatha.tsv").lines().skip(1) {
        let fields: Vec<_> = line.split('\t').collect();
        if fields.len() < 3 { continue; }
        let group = fields[0].split('.').next().and_then(|s| s.parse::<u8>().ok());
        if group == Some(gana) && fields[1] == key {
            let meaning = lipi.transliterate(fields[2], Scheme::Slp1, Scheme::Devanagari);
            if !meanings.contains(&meaning) { meanings.push(meaning); }
        }
    }
    meanings.join("; ")
}
fn input_parts(input:&Input, lipi:&mut Lipika)->Vec<Value> {
    match input {
        Input::Basic{text,meaning,..}=>vec![json!({"text":text,"meaning":meaning})],
        Input::Krdanta{dhatu,..}=>vec![json!({"text":dhatu.aupadeshika,"meaning":root_meaning(dhatu,lipi)})],
        Input::Taddhitanta{stem,..}|Input::Subanta{stem,..}=>input_parts(stem,lipi),
        Input::Samasa{members,..}=>members.iter().flat_map(|m|input_parts(&m.stem,lipi)).collect(),
    }
}
// Align visible terms so inserting a suffix does not highlight its neighbour.
// If the text is unchanged, retain Vidyut's flags for grammatical tag changes.
fn highlights(previous: &[String], current: &[String], native: &[bool]) -> Vec<bool> {
    if previous == current { return native.to_vec(); }
    let (n, m) = (previous.len(), current.len());
    let mut lengths = vec![vec![0; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lengths[i][j] = if previous[i] == current[j] { 1 + lengths[i+1][j+1] }
                else { lengths[i+1][j].max(lengths[i][j+1]) };
        }
    }
    let mut changed = vec![true; m];
    let (mut i, mut j) = (0, 0);
    while i < n && j < m {
        if previous[i] == current[j] { changed[j] = false; i += 1; j += 1; }
        else if lengths[i+1][j] >= lengths[i][j+1] { i += 1; }
        else { j += 1; }
    }
    changed
}
fn rule_text(source: &str, code: &str, lipi: &mut Lipika) -> String {
    let table = match source {
        "ashtadhyayi" => include_str!("../data/sutrapatha.tsv"),
        "unadi" => include_str!("../data/unadipatha.tsv"),
        "linganushasana" => include_str!("../data/linganushasanam.tsv"),
        "varttika" => include_str!("../data/varttikas.tsv"),
        _ => return String::new(),
    };
    table.lines().filter_map(|line| line.split_once('\t'))
        .find(|(key, _)| *key == code)
        .map(|(_, text)| lipi.transliterate(text.trim(), Scheme::Slp1, Scheme::Devanagari))
        .unwrap_or_default()
}
fn run(req:Request, list:bool)->Result<Value> {
    let mut lipi=Lipika::new();
    let v=Vyakarana::builder().log_steps(true).is_chandasi(req.chandasi).build();
    let candidates=match &req.input {
        Input::Subanta{stem:s,gender,case,number}=>v.derive_subantas(&Subanta::new(stem(s,&mut lipi,0)?,gender.arg(),case.arg(),number.arg())),
        other=>v.derive_pratipadikas(&stem(other,&mut lipi,0)?),
    };
    if candidates.is_empty(){return Err("Vidyut produced no result. Check the input; this operation may be unsupported.".into());}
    let available:Vec<_>=candidates.iter().map(|p|lipi.transliterate(p.text(),Scheme::Slp1,Scheme::Devanagari)).collect();
    let expected=req.expected.as_ref().map(|s|slp(s,&mut lipi)).transpose()?;
    let matching:Vec<&Prakriya>=candidates.iter().filter(|p|expected.as_ref().map_or(true,|e|p.text()==*e)).collect();
    if matching.is_empty(){return Err(format!("Expected form not generated. Available: {}",available.join(", ")));}
    if list {
        let variants:Vec<_>=matching.iter().enumerate().map(|(index,p)| {
            let history:Vec<_>=p.history().iter().filter(|s| !s.rule().code().trim().is_empty()).map(|s|json!({
                "source":s.rule().source_name(), "rule":s.rule().code(),
                "parts":s.result().iter().map(|t|lipi.transliterate(t.text(),Scheme::Slp1,Scheme::Devanagari)).collect::<Vec<_>>()
            })).collect();
            json!({"variant":index,"form":lipi.transliterate(p.text(),Scheme::Slp1,Scheme::Devanagari),"history":history})
        }).collect();
        return Ok(json!({"variants":variants}));
    }
    if matching.len()>1 && req.variant.is_none(){return Err(format!("{} histories match. Supply variant (zero-based) after reviewing engine output. Forms: {}",matching.len(),available.join(", ")));}
    let chosen=matching.get(req.variant.unwrap_or(0)).ok_or("variant is out of range")?;
    let mut rows=vec![json!({"parts":input_parts(&req.input,&mut lipi),"rules":[]})];
    let mut references=serde_json::Map::new();
    let mut previous: Vec<String> = Vec::new();
    // Join only the top-level word, not an internal compound member's pada.
    let join_at = if matches!(&req.input, Input::Subanta{..}) {
        chosen.history().iter().rposition(|s| s.rule().source_name() == "azwADyAyI" && s.rule().code() == "1.4.14")
    } else { None };
    for (index, step) in chosen.history().iter().enumerate() {
        let rule=step.rule();
        if rule.code().trim().is_empty() { continue; } // Engine debug messages are not grammatical steps.
        let source=match rule.source_name(){"azwADyAyI"=>"ashtadhyayi","uRAdipAWaH"=>"unadi","liNgAnuSAsanam"=>"linganushasana","vArttikAH"=>"varttika",other=>other};
        let id=format!("{source}:{}",rule.code());
        let url=if source=="ashtadhyayi" {format!("https://ashtadhyayi.com/sutraani/{}",rule.code().replace('.',"/"))} else if source=="unadi" {
            format!("https://ashtadhyayi.com/unaadi/{}", rule.code())
        } else if source=="linganushasana" {
            "https://ashtadhyayi.com/linganushasanam".to_owned()
        } else if source=="varttika" {
            let parent = rule.code().split('.').take(3).collect::<Vec<_>>().join("/");
            format!("https://ashtadhyayi.com/sutraani/{parent}")
        } else {String::new()};
        references.insert(id.clone(),json!({"number":rule.code(),"text":rule_text(source,rule.code(),&mut lipi),"url":url}));
        let current: Vec<String> = step.result().iter().map(|t| t.text().to_owned()).collect();
        let native: Vec<bool> = step.result().iter().map(|t| t.was_changed()).collect();
        let changed = highlights(&previous, &current, &native);
        let parts: Vec<Value> = if join_at.is_some_and(|start| index >= start) {
            // Join SLP1 first: joining separately transliterated parts would retain halants.
            vec![json!({"text":lipi.transliterate(current.concat(),Scheme::Slp1,Scheme::Devanagari),
                "highlight":join_at == Some(index) || changed.iter().any(|x| *x)})]
        } else {
            step.result().iter().enumerate().filter(|(_,t)| !t.text().is_empty())
                .map(|(i,t)|json!({"text":lipi.transliterate(t.text(),Scheme::Slp1,Scheme::Devanagari),"highlight":changed[i]})).collect()
        };
        // Compare engine terms before display joining: inserted suffixes/augments
        // must retain their form even when the rule is tagged as a designation.
        let introduces_particle = !previous.is_empty() && current.len() > previous.len();
        previous = current;
        rows.push(json!({"parts":parts,"rules":[id],"introduces_particle":introduces_particle}));
    }
    Ok(json!({"prakriyA":rows,"rules":references,"result":lipi.transliterate(chosen.text(),Scheme::Slp1,Scheme::Devanagari),"matching_histories":matching.len(),"engine":"vidyut@8da2f90bee3ce1c07505fa432fc3729e3f7e02ea"}))
}
fn main() {
    let mut text=String::new(); io::stdin().read_to_string(&mut text).unwrap();
    let result=serde_json::from_str::<Request>(&text).map_err(|e|e.to_string()).and_then(|req|run(req,std::env::args().any(|s|s=="--list")));
    match result {Ok(v)=>println!("{v}"),Err(e)=>{eprintln!("{e}");std::process::exit(1)}}
}
