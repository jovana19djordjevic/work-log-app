/*
 * GOOGLE APPS SCRIPT BACKEND
 *
 * Kopiraj ceo fajl u Apps Script Code.gs.
 * SPREADSHEET_ID mora biti ID dokumenta između /d/ i /edit u Sheets URL-u.
 */

const SPREADSHEET_ID = "1NqNNW9F5OGeaWVrSKsPdb83KKQRg7PlODWtvTB-w98I";
// Promeni ovaj PIN pre objavljivanja. PIN ostaje samo u Apps Script kodu.
const APP_PIN = "1914";
const PROJECTS_SHEET = "Projects";
const ENTRIES_SHEET = "WorkEntries";

const PROJECT_HEADERS = ["ProjectID", "ProjectName", "CreatedAt", "IsDeleted"];

const ENTRY_HEADERS = [
	"EntryID",
	"ProjectID",
	"Date",
	"Description",
	"Hours",
	"CreatedAt",
	"IsDeleted",
];

function doGet(e) {
	const callback = e && e.parameter ? e.parameter.callback : "";

	try {
		ensureDatabase();
		const action = String(e.parameter.action || "");
		verifyPin(e.parameter.pin);
		let data;

		switch (action) {
			case "authenticate":
				data = { success: true };
				break;

			case "getProjects":
				data = { success: true, projects: getProjects() };
				break;

			case "getEntries":
				data = {
					success: true,
					entries: getEntries(
						requireText(e.parameter.projectId, "ProjectID"),
						optionalMonth(e.parameter.month),
					),
				};
				break;

			case "getReport":
				data = {
					success: true,
					report: getReport(validateMonth(e.parameter.month)),
				};
				break;

			default:
				throw new Error("Nepoznata GET akcija.");
		}

		return apiResponse(data, callback);
	} catch (error) {
		return apiResponse({ success: false, message: error.message }, callback);
	}
}

function doPost(e) {
	try {
		ensureDatabase();
		const data = JSON.parse(
			e && e.postData && e.postData.contents ? e.postData.contents : "{}",
		);
		verifyPin(data.pin);
		const action = String(data.action || "");
		const lock = LockService.getScriptLock();
		lock.waitLock(15000);

		try {
			switch (action) {
				case "createProject":
					createProject(data);
					break;
				case "createEntry":
					createEntry(data);
					break;
				case "updateEntry":
					updateEntry(data);
					break;
				case "deleteProject":
					deleteProject(data);
					break;
				case "deleteEntry":
					deleteEntry(data);
					break;
				case "exportReport":
					exportReport(data);
					break;
				default:
					throw new Error("Nepoznata POST akcija.");
			}
			SpreadsheetApp.flush();
		} finally {
			lock.releaseLock();
		}

		return jsonResponse({ success: true });
	} catch (error) {
		return jsonResponse({ success: false, message: error.message });
	}
}

function ensureDatabase() {
	if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
		throw new Error("Unesi SPREADSHEET_ID u Apps Script kod.");
	}

	const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
	ensureSheet(spreadsheet, PROJECTS_SHEET, PROJECT_HEADERS);
	ensureSheet(spreadsheet, ENTRIES_SHEET, ENTRY_HEADERS);
}

function ensureSheet(spreadsheet, sheetName, headers) {
	let sheet = spreadsheet.getSheetByName(sheetName);

	if (!sheet) {
		sheet = spreadsheet.insertSheet(sheetName);
	}

	if (sheet.isSheetHidden()) {
		sheet.showSheet();
	}

	const current =
		sheet.getLastRow() > 0
			? sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]
			: [];
	const correct = headers.every(function (header, index) {
		return current[index] === header;
	});

	if (!correct) {
		sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
	}

	sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
	sheet.setFrozenRows(1);
	return sheet;
}

function getSheet(sheetName) {
	const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
	const headers =
		sheetName === PROJECTS_SHEET ? PROJECT_HEADERS : ENTRY_HEADERS;
	return ensureSheet(spreadsheet, sheetName, headers);
}

function getProjects() {
	const sheet = getSheet(PROJECTS_SHEET);
	const rows = readRows(sheet, PROJECT_HEADERS.length);

	return rows
		.filter(function (row) {
			return !isDeleted(row[3]) && String(row[0]).trim();
		})
		.map(function (row) {
			return {
				projectId: String(row[0]),
				projectName: String(row[1]),
				createdAt: normalizeDateTime(row[2]),
			};
		})
		.sort(function (a, b) {
			return a.projectName.localeCompare(b.projectName);
		});
}

function getEntries(projectId, month) {
	const sheet = getSheet(ENTRIES_SHEET);
	const rows = readRows(sheet, ENTRY_HEADERS.length);

	return rows
		.filter(function (row) {
			if (isDeleted(row[6])) return false;
			if (String(row[1]) !== projectId) return false;
			const date = normalizeDate(row[2]);
			return !month || date.indexOf(month + "-") === 0;
		})
		.map(function (row) {
			return {
				entryId: String(row[0]),
				projectId: String(row[1]),
				date: normalizeDate(row[2]),
				description: String(row[3]),
				hours: Number(row[4]),
				createdAt: normalizeDateTime(row[5]),
			};
		})
		.sort(function (a, b) {
			return b.date.localeCompare(a.date);
		});
}

function getReport(month) {
	return getProjects().map(function (project) {
		const entries = getEntries(project.projectId, month);
		const totalHours = entries.reduce(function (sum, entry) {
			return sum + Number(entry.hours);
		}, 0);
		const days = {};
		entries.forEach(function (entry) {
			days[entry.date] = true;
		});

		return {
			projectId: project.projectId,
			projectName: project.projectName,
			totalHours: totalHours,
			workingDays: Object.keys(days).length,
		};
	});
}

function createProject(data) {
	const projectId = requireText(data.projectId, "ProjectID");
	const projectName = requireText(data.projectName, "Naziv gradilišta");

	if (projectName.length > 120) {
		throw new Error("Naziv gradilišta je predugačak.");
	}

	const existingById = getProjects().find(function (project) {
		return project.projectId === projectId;
	});

	// Ponovljeni isti zahtev ne pravi duplikat.
	if (existingById) {
		if (existingById.projectName === projectName) return;
		throw new Error("ProjectID već postoji.");
	}

	const duplicate = getProjects().some(function (project) {
		return project.projectName.toLowerCase() === projectName.toLowerCase();
	});

	if (duplicate) {
		throw new Error("Gradilište sa tim nazivom već postoji.");
	}

	const sheet = getSheet(PROJECTS_SHEET);
	appendRow(sheet, [projectId, projectName, new Date(), false]);
}

function createEntry(data) {
	const entryId = requireText(data.entryId, "EntryID");
	const projectId = requireText(data.projectId, "ProjectID");
	const date = validateDate(data.date);
	const description = requireText(data.description, "Opis rada");
	const hours = Number(data.hours);

	if (description.length > 500) {
		throw new Error("Opis rada je predugačak.");
	}

	if (!isFinite(hours) || hours <= 0 || hours > 24) {
		throw new Error("Sati moraju biti između 0 i 24.");
	}

	const projectExists = getProjects().some(function (project) {
		return project.projectId === projectId;
	});

	if (!projectExists) {
		throw new Error("Gradilište ne postoji ili je obrisano.");
	}

	const sheet = getSheet(ENTRIES_SHEET);
	const existingRow = findRowById(sheet, entryId, 1);

	// Idempotentno čuvanje: ponovljen zahtev sa istim ID-em ne pravi duplikat.
	if (existingRow) {
		const existing = sheet
			.getRange(existingRow, 1, 1, ENTRY_HEADERS.length)
			.getValues()[0];
		if (
			!isDeleted(existing[6]) &&
			String(existing[1]) === projectId &&
			normalizeDate(existing[2]) === date &&
			String(existing[3]) === description &&
			Number(existing[4]) === hours
		) {
			return;
		}
		throw new Error("EntryID već postoji.");
	}

	const nextRow = Math.max(sheet.getLastRow() + 1, 2);
	sheet.getRange(nextRow, 3).setNumberFormat("@");
	sheet
		.getRange(nextRow, 1, 1, ENTRY_HEADERS.length)
		.setValues([
			[entryId, projectId, date, description, hours, new Date(), false],
		]);
	sheet.getRange(nextRow, 5).setNumberFormat("0.00");
	sheet.getRange(nextRow, 6).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function updateEntry(data) {
	const entryId = requireText(data.entryId, "EntryID");
	const projectId = requireText(data.projectId, "ProjectID");
	const date = validateDate(data.date);
	const description = requireText(data.description, "Opis rada");
	const hours = Number(data.hours);

	if (description.length > 500) {
		throw new Error("Opis rada je predugačak.");
	}

	if (!isFinite(hours) || hours <= 0 || hours > 24) {
		throw new Error("Sati moraju biti između 0 i 24.");
	}

	const sheet = getSheet(ENTRIES_SHEET);
	const row = findRowById(sheet, entryId, 1);

	if (!row) {
		throw new Error("Radni unos nije pronađen.");
	}

	const current = sheet
		.getRange(row, 1, 1, ENTRY_HEADERS.length)
		.getValues()[0];

	if (isDeleted(current[6])) {
		throw new Error("Obrisani unos ne može da se menja.");
	}

	if (String(current[1]) !== projectId) {
		throw new Error("Unos ne pripada izabranom gradilištu.");
	}

	sheet.getRange(row, 3).setNumberFormat("@");
	sheet.getRange(row, 3, 1, 3).setValues([[date, description, hours]]);
	sheet.getRange(row, 5).setNumberFormat("0.00");
}

function deleteProject(data) {
	const projectId = requireText(data.projectId, "ProjectID");
	const projectSheet = getSheet(PROJECTS_SHEET);
	const projectRow = findRowById(projectSheet, projectId, 1);

	if (!projectRow) {
		throw new Error("Gradilište nije pronađeno.");
	}

	projectSheet.getRange(projectRow, 4).setValue(true);

	const entrySheet = getSheet(ENTRIES_SHEET);
	const lastRow = entrySheet.getLastRow();

	if (lastRow >= 2) {
		const values = entrySheet
			.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length)
			.getValues();
		values.forEach(function (row, index) {
			if (String(row[1]) === projectId && !isDeleted(row[6])) {
				entrySheet.getRange(index + 2, 7).setValue(true);
			}
		});
	}
}

function deleteEntry(data) {
	const entryId = requireText(data.entryId, "EntryID");
	const sheet = getSheet(ENTRIES_SHEET);
	const row = findRowById(sheet, entryId, 1);

	if (!row) {
		throw new Error("Radni unos nije pronađen.");
	}

	sheet.getRange(row, 7).setValue(true);
}

/*
 * Kreira report samo za jedno gradilište i izabrani mesec.
 * Primer naziva taba: "Zgrada 1 2026-06".
 */
function exportReport(data) {
	const month = validateMonth(data.month);
	const projectId = requireText(data.projectId, "ProjectID");
	const project = getProjects().find(function (item) {
		return item.projectId === projectId;
	});

	if (!project) {
		throw new Error("Gradilište nije pronađeno.");
	}

	const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
	const reportSheetName = createReportSheetName(project.projectName, month);
	let sheet = spreadsheet.getSheetByName(reportSheetName);

	if (!sheet) {
		sheet = spreadsheet.insertSheet(reportSheetName);
	} else {
		sheet.clear();
	}

	const rows = [["Gradilište", "Datum", "Šta sam radio", "Sati"]];
	const entries = getEntries(projectId, month);
	let projectTotal = 0;

	entries.forEach(function (entry) {
		const hours = Number(entry.hours);
		projectTotal += hours;
		rows.push([project.projectName, entry.date, entry.description, hours]);
	});

	rows.push(["UKUPNO", month, "", projectTotal]);
	sheet.getRange(1, 1, rows.length, 4).setValues(rows);

	// Jednostavno formatiranje reporta.
	sheet
		.getRange(1, 1, 1, 4)
		.setFontWeight("bold")
		.setBackground("#2563EB")
		.setFontColor("#FFFFFF");
	sheet.setFrozenRows(1);
	sheet.getRange(2, 2, Math.max(rows.length - 1, 1), 1).setNumberFormat("@");
	sheet.getRange(2, 4, Math.max(rows.length - 1, 1), 1).setNumberFormat("0.00");
	sheet.autoResizeColumns(1, 4);
	sheet.setColumnWidth(1, Math.max(sheet.getColumnWidth(1), 180));
	sheet.setColumnWidth(3, Math.max(sheet.getColumnWidth(3), 280));

	const lastRow = rows.length;
	sheet
		.getRange(lastRow, 1, 1, 4)
		.setFontWeight("bold")
		.setBackground("#ECFDF5");
}

function createReportSheetName(projectName, month) {
	// Google Sheets ne dozvoljava ove znakove u nazivu taba.
	const safeName = String(projectName)
		.replace(/[\[\]*?/\\:]/g, "-")
		.trim();
	return (safeName + " " + month).slice(0, 100);
}

function appendRow(sheet, values) {
	const row = Math.max(sheet.getLastRow() + 1, 2);
	sheet.getRange(row, 1, 1, values.length).setValues([values]);
	sheet.getRange(row, 3).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function findRowById(sheet, id, idColumn) {
	const lastRow = sheet.getLastRow();
	if (lastRow < 2) return 0;

	const values = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();

	for (let index = 0; index < values.length; index += 1) {
		if (String(values[index][0]) === id) {
			return index + 2;
		}
	}
	return 0;
}

function readRows(sheet, columnCount) {
	const lastRow = sheet.getLastRow();
	if (lastRow < 2) return [];
	return sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
}

function isDeleted(value) {
	return value === true || String(value).toUpperCase() === "TRUE";
}

function requireText(value, fieldName) {
	const text = String(value || "").trim();
	if (!text) throw new Error(fieldName + " je obavezan.");
	return text;
}

function verifyPin(value) {
	if (!APP_PIN || APP_PIN === "CHANGE_ME") {
		throw new Error("APP_PIN nije podešen u Apps Script-u.");
	}

	if (String(value || "") !== String(APP_PIN)) {
		throw new Error("Pogrešan PIN.");
	}
}

function validateDate(value) {
	const date = String(value || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error("Datum nije ispravan.");
	}
	return date;
}

function validateMonth(value) {
	const month = String(value || "").trim();
	if (!/^\d{4}-\d{2}$/.test(month)) {
		throw new Error("Mesec nije ispravan.");
	}
	return month;
}

function optionalMonth(value) {
	const month = String(value || "").trim();
	return month ? validateMonth(month) : "";
}

function normalizeDate(value) {
	if (value instanceof Date) {
		return Utilities.formatDate(
			value,
			Session.getScriptTimeZone(),
			"yyyy-MM-dd",
		);
	}
	return String(value || "")
		.trim()
		.slice(0, 10);
}

function normalizeDateTime(value) {
	if (value instanceof Date) {
		return Utilities.formatDate(
			value,
			Session.getScriptTimeZone(),
			"yyyy-MM-dd HH:mm:ss",
		);
	}
	return String(value || "");
}

function jsonResponse(data) {
	return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
		ContentService.MimeType.JSON,
	);
}

function apiResponse(data, callback) {
	const name = String(callback || "");

	if (name && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(name)) {
		return ContentService.createTextOutput(
			name + "(" + JSON.stringify(data) + ");",
		).setMimeType(ContentService.MimeType.JAVASCRIPT);
	}

	return jsonResponse(data);
}
