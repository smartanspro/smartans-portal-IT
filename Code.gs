// ============================================================
// Apps Script Web App — backend liviano del Portal de Operaciones.
// Con una sola URL desplegada:
//   1) Sube PDFs (y las imágenes de las fichas) a Drive (acción "uploadPdf",
//      usada también internamente por "saveFicha" para hero/logo).
//   2) Login + ABM de usuarios y roles contra una Google Sheet (acciones
//      "login" / "listUsers" / "createUser" / "updateUser" / "deleteUser").
//   3) Persistencia COMPARTIDA de los módulos del portal — ya no viven en el
//      localStorage de cada navegador, sino en esta misma Sheet:
//      Fichas ("listFichas"/"saveFicha"/"deleteFicha"), configuración de
//      Notificaciones ("getNotifConfig"/"saveNotifConfig") y la lista de
//      servicios de Monitoreo ("listServicios"/"saveServicio"/"deleteServicio").
//
// Cómo usarlo (reemplaza TODO tu Code.gs actual por este archivo):
// 1. Creá una Google Sheet nueva (o usá una que ya tengas) para guardar
//    los usuarios. Abrila, copiá el ID de la URL:
//    docs.google.com/spreadsheets/d/ESTE-ID/edit
// 2. Pegá ese ID en SPREADSHEET_ID más abajo.
// 3. Revisá que FOLDER_ID siga siendo el de tu carpeta de Drive ("FICHAS").
// 4. En script.google.com, borrá TODO tu Code.gs actual y pegá este archivo.
// 5. Implementar → Gestionar implementaciones → editá la implementación
//    activa → guardá (o creá una nueva implementación) para que tome
//    los cambios. "Quién tiene acceso" tiene que seguir en "Cualquier
//    usuario".
// 6. La primera vez que se ejecuta, si la hoja "Usuarios" no existe, el
//    script la crea sola con un usuario semilla:
//      usuario: smartans   contraseña: smartans   rol: admin
//    Entrá al portal con esas credenciales y cambiá esa contraseña (o
//    creá tu propio usuario admin y desactivá/borrá el semilla) desde
//    la pantalla "Administración → Usuarios y Roles".
// ============================================================

var FOLDER_ID = '1ngNIzPC7Hhu5vTurAJApxeCgcO7IvpkY';       // carpeta de Drive para los PDFs
var SPREADSHEET_ID = '18-ohD9jvNt9veG-J4zHyeh5WnBtw2Fbl1geTtBdZcj4'; // Google Sheet para usuarios
var USERS_SHEET_NAME = 'Usuarios';

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: 'Cuerpo de la petición inválido.' });
  }

  var action = body.action || 'uploadPdf'; // compatibilidad con peticiones viejas sin "action"

  switch (action) {
    case 'uploadPdf':      return handleUploadPdf(body);
    case 'login':          return handleLogin(body);
    case 'listUsers':      return handleListUsers(body);
    case 'createUser':     return handleCreateUser(body);
    case 'updateUser':     return handleUpdateUser(body);
    case 'deleteUser':     return handleDeleteUser(body);
    case 'listFichas':     return handleListFichas(body);
    case 'saveFicha':      return handleSaveFicha(body);
    case 'deleteFicha':    return handleDeleteFicha(body);
    case 'getNotifConfig': return handleGetNotifConfig(body);
    case 'saveNotifConfig':return handleSaveNotifConfig(body);
    case 'listServicios':  return handleListServicios(body);
    case 'saveServicio':   return handleSaveServicio(body);
    case 'deleteServicio': return handleDeleteServicio(body);
    default:               return jsonOut({ ok: false, error: 'Acción desconocida: ' + action });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   SUBIDA DE PDF A DRIVE
============================================================ */
function handleUploadPdf(datos) {
  try {
    var bytes = Utilities.base64Decode(datos.fileData);
    var blob = Utilities.newBlob(bytes, datos.mimeType || 'application/pdf', datos.fileName || 'archivo.pdf');

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var file = folder.createFile(blob);
    try {
      // la carpeta destino ya está compartida como "cualquiera con el link" — los
      // archivos nuevos heredan ese acceso. Si el dominio (Workspace) bloquea compartir
      // fuera de la organización, esta llamada falla — no debe tumbar toda la subida.
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // seguimos igual: el archivo ya se creó y hereda el permiso de la carpeta
    }

    var link = 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing';
    return jsonOut({ ok: true, link: link, id: file.getId() });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ============================================================
   USUARIOS — helpers de la hoja de cálculo
   Columnas: usuario | passwordHash | salt | rol | activo | modulos
   "modulos" es una lista separada por comas con los módulos que ese
   usuario puede ver (ej: "fichas,rpa,notificaciones"). Si viene vacía
   (usuarios creados antes de este cambio), se asume acceso a todos.
============================================================ */
var ALL_MODULES = ['fichas', 'rpa', 'agentes', 'monitoreo', 'notificaciones'];

function parseModulos_(raw) {
  if (!raw) return ALL_MODULES.slice(); // sin dato = todos, por compatibilidad con usuarios viejos
  return String(raw).split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}
function stringifyModulos_(arr) {
  if (!arr || !arr.length) return ALL_MODULES.join(',');
  return arr.join(',');
}

function getUsersSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    // hoja recién creada, o ya existía pero completamente vacía: sembramos headers + admin
    sheet.appendRow(['usuario', 'passwordHash', 'salt', 'rol', 'activo', 'modulos']);
    // usuario semilla para el primer ingreso — cambiar la contraseña apenas se pueda
    var salt = makeSalt_();
    sheet.appendRow(['smartans', hashPassword_('smartans', salt), salt, 'admin', true, ALL_MODULES.join(',')]);
  }
  return sheet;
}
function makeSalt_() {
  return Utilities.getUuid();
}
function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function findUserRow_(sheet, usuario) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === usuario) return { index: i + 1, row: rows[i] }; // index 1-based para getRange
  }
  return null;
}
function isValidUser_(usuario, password) {
  // cualquier usuario activo (no necesariamente admin) — usado por las acciones
  // de fichas/notificaciones/monitoreo, que son compartidas por todo el equipo.
  if (!usuario || !password) return false;
  var sheet = getUsersSheet_();
  var found = findUserRow_(sheet, usuario);
  if (!found) return false;
  var row = found.row;
  if (row[4] !== true) return false;
  return hashPassword_(password, row[2]) === row[1];
}
function isAdmin_(usuario, password) {
  if (!isValidUser_(usuario, password)) return false;
  var sheet = getUsersSheet_();
  var found = findUserRow_(sheet, usuario);
  return found.row[3] === 'admin';
}

/* ============================================================
   LOGIN
============================================================ */
function handleLogin(datos) {
  try {
    var sheet = getUsersSheet_();
    var found = findUserRow_(sheet, datos.usuario);
    if (!found) return jsonOut({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    var row = found.row;
    if (row[4] !== true) return jsonOut({ ok: false, error: 'Ese usuario está deshabilitado.' });
    if (hashPassword_(datos.password, row[2]) !== row[1]) {
      return jsonOut({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    }
    return jsonOut({ ok: true, rol: row[3], modulos: parseModulos_(row[5]) });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ============================================================
   ABM DE USUARIOS (requiere adminUser/adminPassword de un admin activo)
============================================================ */
function handleListUsers(datos) {
  if (!isAdmin_(datos.adminUser, datos.adminPassword)) return jsonOut({ ok: false, error: 'No autorizado.' });
  var sheet = getUsersSheet_();
  var rows = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < rows.length; i++) {
    users.push({ usuario: rows[i][0], rol: rows[i][3], activo: rows[i][4] === true, modulos: parseModulos_(rows[i][5]) });
  }
  return jsonOut({ ok: true, users: users });
}

function handleCreateUser(datos) {
  if (!isAdmin_(datos.adminUser, datos.adminPassword)) return jsonOut({ ok: false, error: 'No autorizado.' });
  if (!datos.usuario || !datos.password) return jsonOut({ ok: false, error: 'Faltan datos del usuario nuevo.' });
  var sheet = getUsersSheet_();
  if (findUserRow_(sheet, datos.usuario)) return jsonOut({ ok: false, error: 'Ese usuario ya existe.' });
  var salt = makeSalt_();
  var hash = hashPassword_(datos.password, salt);
  sheet.appendRow([datos.usuario, hash, salt, datos.rol || 'usuario', true, stringifyModulos_(datos.modulos)]);
  return jsonOut({ ok: true });
}

function handleUpdateUser(datos) {
  if (!isAdmin_(datos.adminUser, datos.adminPassword)) return jsonOut({ ok: false, error: 'No autorizado.' });
  var sheet = getUsersSheet_();
  var found = findUserRow_(sheet, datos.usuario);
  if (!found) return jsonOut({ ok: false, error: 'Usuario no encontrado.' });
  if (datos.nuevoPassword) {
    var salt = makeSalt_();
    var hash = hashPassword_(datos.nuevoPassword, salt);
    sheet.getRange(found.index, 2).setValue(hash);
    sheet.getRange(found.index, 3).setValue(salt);
  }
  if (datos.rol) sheet.getRange(found.index, 4).setValue(datos.rol);
  if (typeof datos.activo === 'boolean') sheet.getRange(found.index, 5).setValue(datos.activo);
  if (datos.modulos) sheet.getRange(found.index, 6).setValue(stringifyModulos_(datos.modulos));
  return jsonOut({ ok: true });
}

function handleDeleteUser(datos) {
  if (!isAdmin_(datos.adminUser, datos.adminPassword)) return jsonOut({ ok: false, error: 'No autorizado.' });
  if (datos.usuario === datos.adminUser) return jsonOut({ ok: false, error: 'No podés eliminar el usuario con el que estás logueado.' });
  var sheet = getUsersSheet_();
  var found = findUserRow_(sheet, datos.usuario);
  if (!found) return jsonOut({ ok: false, error: 'Usuario no encontrado.' });
  sheet.deleteRow(found.index);
  return jsonOut({ ok: true });
}

/* ============================================================
   HELPERS DE IMÁGENES EN DRIVE (para fichas)
   Las imágenes (foto + logo de la ficha "Canje de tierra") NO se guardan
   en la Sheet como base64: una celda de Sheets tiene un límite de 50.000
   caracteres y una imagen en base64 lo supera fácil. En cambio:
     - al guardar, si viene una imagen nueva (data:...;base64,...) se sube
       como archivo a Drive y sólo se guarda su fileId en la Sheet.
     - al listar, el fileId se vuelve a descargar y se devuelve como
       base64 al front — así el <img> y el html2canvas del PDF siguen
       funcionando exactamente igual que antes (nunca hay que "hotlinkear"
       una URL de Drive, que además no tiene los headers CORS que
       html2canvas necesita).
   Se guarda también un hash del base64 para no re-subir a Drive en cada
   autoguardado si la imagen no cambió.
============================================================ */
function uploadImageToDrive_(dataUrl, filename) {
  var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return null;
  var mimeType = m[1];
  var bytes = Utilities.base64Decode(m[2]);
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // la carpeta ya comparte el acceso; si el dominio bloquea compartir hacia
    // afuera no hace falta cortar la subida por eso.
  }
  return file.getId();
}
function downloadImageFromDrive_(fileId) {
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return null;
  }
}
function hashDataUrl_(dataUrl) {
  if (!dataUrl) return '';
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataUrl);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/* ============================================================
   FICHAS — persistencia compartida (reemplaza el localStorage del front)
   Columnas: id | tipo | nombre | updatedAt | dataJSON | heroFileId | heroHash | logoFileId | logoHash
   Requiere usuario/password de CUALQUIER usuario activo (no sólo admin):
   las fichas las usa todo el equipo, no es una pantalla de administración.
============================================================ */
var FICHAS_SHEET_NAME = 'Fichas';

function getFichasSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(FICHAS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(FICHAS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'tipo', 'nombre', 'updatedAt', 'dataJSON', 'heroFileId', 'heroHash', 'logoFileId', 'logoHash']);
  }
  return sheet;
}
function findFichaRow_(sheet, id) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return { index: i + 1, row: rows[i] };
  }
  return null;
}

function handleListFichas(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getFichasSheet_();
    var rows = sheet.getDataRange().getValues();
    var fichas = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var data = {};
      try { data = JSON.parse(r[4] || '{}'); } catch (e) { data = {}; }
      var hero = r[5] ? downloadImageFromDrive_(r[5]) : null;
      var logo = r[7] ? downloadImageFromDrive_(r[7]) : null;
      fichas.push({ id: r[0], tipo: r[1], nombre: r[2], updatedAt: r[3], data: data, hero: hero, logo: logo });
    }
    return jsonOut({ ok: true, fichas: fichas });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleSaveFicha(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  if (!datos.id || !datos.tipo) return jsonOut({ ok: false, error: 'Faltan datos de la ficha.' });
  try {
    var sheet = getFichasSheet_();
    var found = findFichaRow_(sheet, datos.id);
    var data = datos.data || {};
    var hero = datos.hero; // string base64 (nueva/cambiada), string ya-no-usada (falsy) o undefined (no tocada)
    var logo = datos.logo;

    var heroFileId = found ? found.row[5] : '';
    var heroHash = found ? found.row[6] : '';
    if (hero && String(hero).indexOf('data:') === 0) {
      var newHeroHash = hashDataUrl_(hero);
      if (newHeroHash !== heroHash) {
        var newHeroId = uploadImageToDrive_(hero, 'hero-' + datos.id + '.jpg');
        if (newHeroId) {
          if (heroFileId) { try { DriveApp.getFileById(heroFileId).setTrashed(true); } catch (e) {} }
          heroFileId = newHeroId;
          heroHash = newHeroHash;
        }
      }
    } else if (hero === null) {
      // el front manda null explícito cuando se sacó la imagen; undefined = "no la tocamos"
      if (heroFileId) { try { DriveApp.getFileById(heroFileId).setTrashed(true); } catch (e) {} }
      heroFileId = ''; heroHash = '';
    }

    var logoFileId = found ? found.row[7] : '';
    var logoHash = found ? found.row[8] : '';
    if (logo && String(logo).indexOf('data:') === 0) {
      var newLogoHash = hashDataUrl_(logo);
      if (newLogoHash !== logoHash) {
        var newLogoId = uploadImageToDrive_(logo, 'logo-' + datos.id + '.png');
        if (newLogoId) {
          if (logoFileId) { try { DriveApp.getFileById(logoFileId).setTrashed(true); } catch (e) {} }
          logoFileId = newLogoId;
          logoHash = newLogoHash;
        }
      }
    } else if (logo === null) {
      if (logoFileId) { try { DriveApp.getFileById(logoFileId).setTrashed(true); } catch (e) {} }
      logoFileId = ''; logoHash = '';
    }

    var dataJSON = JSON.stringify(data);
    var now = new Date().toISOString();
    var rowValues = [datos.id, datos.tipo, datos.nombre || '', now, dataJSON, heroFileId, heroHash, logoFileId, logoHash];
    if (found) {
      sheet.getRange(found.index, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    return jsonOut({ ok: true, updatedAt: now });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleDeleteFicha(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getFichasSheet_();
    var found = findFichaRow_(sheet, datos.id);
    if (!found) return jsonOut({ ok: false, error: 'Ficha no encontrada.' });
    if (found.row[5]) { try { DriveApp.getFileById(found.row[5]).setTrashed(true); } catch (e) {} }
    if (found.row[7]) { try { DriveApp.getFileById(found.row[7]).setTrashed(true); } catch (e) {} }
    sheet.deleteRow(found.index);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ============================================================
   NOTIFICACIONES — configuración compartida (Slack / Telegram / Email)
   Una sola fila de datos. Columnas: slackWebhook | telegramToken | telegramChat | emailTo
============================================================ */
var NOTIF_SHEET_NAME = 'NotifConfig';

function getNotifConfigSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(NOTIF_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(NOTIF_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['slackWebhook', 'telegramToken', 'telegramChat', 'emailTo']);
    sheet.appendRow(['', '', '', '']);
  }
  return sheet;
}

function handleGetNotifConfig(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getNotifConfigSheet_();
    var row = sheet.getRange(2, 1, 1, 4).getValues()[0];
    return jsonOut({ ok: true, config: { slackWebhook: row[0] || '', telegramToken: row[1] || '', telegramChat: row[2] || '', emailTo: row[3] || '' } });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleSaveNotifConfig(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getNotifConfigSheet_();
    var c = datos.config || {};
    sheet.getRange(2, 1, 1, 4).setValues([[c.slackWebhook || '', c.telegramToken || '', c.telegramChat || '', c.emailTo || '']]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ============================================================
   MONITOREO — lista compartida de servicios a chequear
   Columnas: id | name | url
============================================================ */
var MONITOR_SHEET_NAME = 'MonitorServicios';

function getMonitorSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MONITOR_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MONITOR_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(['id', 'name', 'url']);
  return sheet;
}

function handleListServicios(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getMonitorSheet_();
    var rows = sheet.getDataRange().getValues();
    var servicios = [];
    for (var i = 1; i < rows.length; i++) servicios.push({ id: rows[i][0], name: rows[i][1], url: rows[i][2] });
    return jsonOut({ ok: true, servicios: servicios });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleSaveServicio(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  if (!datos.name || !datos.url) return jsonOut({ ok: false, error: 'Faltan datos del servicio.' });
  try {
    var sheet = getMonitorSheet_();
    var id = datos.id || Utilities.getUuid();
    var rows = sheet.getDataRange().getValues();
    var foundIndex = null;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) { foundIndex = i + 1; break; }
    }
    if (foundIndex) {
      sheet.getRange(foundIndex, 1, 1, 3).setValues([[id, datos.name, datos.url]]);
    } else {
      sheet.appendRow([id, datos.name, datos.url]);
    }
    return jsonOut({ ok: true, id: id });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleDeleteServicio(datos) {
  if (!isValidUser_(datos.usuario, datos.password)) return jsonOut({ ok: false, error: 'No autorizado.' });
  try {
    var sheet = getMonitorSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(datos.id)) {
        sheet.deleteRow(i + 1);
        return jsonOut({ ok: true });
      }
    }
    return jsonOut({ ok: false, error: 'Servicio no encontrado.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}
