// כפתור "עדכן אתר" לגיליון הנכסים של דו נדל"ן.
// מדביקים את הקוד הזה בגיליון: תוספים > Apps Script.
// המפתח של GitHub לא נכתב כאן בקוד. הוא נשמר בנפרד דרך התפריט "הגדרת מפתח GitHub".

const REPO = 'diklaozer1939/donadlan-site';
const WORKFLOW = 'build.yml';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('דו נדל"ן')
    .addItem('עדכן אתר', 'updateSite')
    .addSeparator()
    .addItem('הגדרת מפתח GitHub', 'setToken')
    .addToUi();
}

function setToken() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('הגדרת מפתח GitHub', 'הדביקי כאן את המפתח (token) שיצרת ב-GitHub:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const token = r.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  ui.alert('המפתח נשמר. מעכשיו אפשר ללחוץ על "עדכן אתר".');
}

function updateSite() {
  const ss = SpreadsheetApp.getActive();
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    SpreadsheetApp.getUi().alert('צריך קודם להגדיר מפתח: תפריט דו נדל"ן > הגדרת מפתח GitHub');
    return;
  }
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    }
  );
  const code = res.getResponseCode();
  if (code === 204) {
    ss.toast('האתר מתעדכן. תוך דקה-שתיים הנכסים יופיעו באתר.', 'דו נדל"ן', 8);
  } else if (code === 401 || code === 403 || code === 404) {
    SpreadsheetApp.getUi().alert('GitHub לא קיבל את המפתח (קוד ' + code + '). ייתכן שפג תוקפו או שחסרה לו הרשאה. צריך ליצור מפתח חדש ולהגדיר אותו שוב.');
  } else {
    SpreadsheetApp.getUi().alert('משהו השתבש (קוד ' + code + '): ' + res.getContentText().slice(0, 200));
  }
}
