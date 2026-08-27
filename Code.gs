// ============================================================
// Apps Script Web App — recibe un PDF en base64 (POST) y lo sube
// a una carpeta específica de Google Drive, devolviendo el link.
//
// Cómo usarlo:
// 1. Andá a script.google.com → Nuevo proyecto.
// 2. Borrá el contenido de Code.gs y pegá TODO este archivo.
// 3. Revisá que FOLDER_ID sea el de tu carpeta "FICHAS" en Drive
//    (ya viene con el ID correcto, pero confirmalo).
// 4. Implementar → Nueva implementación → tipo "Aplicación web".
//    - Ejecutar como: Yo (tu cuenta, la dueña de la carpeta).
//    - Quién tiene acceso: Cualquier usuario.
// 5. Autorizá los permisos que te pida (acceso a tu Drive).
// 6. Copiá la URL que te da ("URL de la aplicación web", termina
//    en /exec) y pegala en index.html en la constante
//    APPS_SCRIPT_URL, reemplazando 'PEGAR_TU_URL_DE_APPS_SCRIPT_AQUI'.
//
// Cada vez que modifiques este script, tenés que crear una NUEVA
// implementación (o editar la existente) para que los cambios se
// apliquen — guardar el script solo no alcanza.
// ============================================================

var FOLDER_ID = '1ngNIzPC7Hhu5vTurAJApxeCgcO7IvpkY'; // ID de la carpeta "FICHAS" en Drive

function doPost(e) {
  try {
    var datos = JSON.parse(e.postData.contents);
    var bytes = Utilities.base64Decode(datos.fileData);
    var blob = Utilities.newBlob(bytes, datos.mimeType || 'application/pdf', datos.fileName || 'archivo.pdf');

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var link = 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing';

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, link: link, id: file.getId() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
