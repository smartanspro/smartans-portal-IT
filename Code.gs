// ============================================================
// Apps Script Web App — backend liviano del Portal de Operaciones.
// Maneja DOS cosas con una sola URL desplegada:
//   1) Subida de PDFs a Drive (acción "uploadPdf")
//   2) Login + ABM de usuarios y roles contra una Google Sheet (acciones
//      "login" / "listUsers" / "createUser" / "updateUser" / "deleteUser")
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
    case 'uploadPdf':   return handleUploadPdf(body);
    case 'login':       return handleLogin(body);
    case 'listUsers':   return handleListUsers(body);
    case 'createUser':  return handleCreateUser(body);
    case 'updateUser':  return handleUpdateUser(body);
    case 'deleteUser':  return handleDeleteUser(body);
    default:            return jsonOut({ ok: false, error: 'Acción desconocida: ' + action });
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
function isAdmin_(usuario, password) {
  if (!usuario || !password) return false;
  var sheet = getUsersSheet_();
  var found = findUserRow_(sheet, usuario);
  if (!found) return false;
  var row = found.row;
  if (row[4] !== true) return false;
  if (row[3] !== 'admin') return false;
  return hashPassword_(password, row[2]) === row[1];
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
