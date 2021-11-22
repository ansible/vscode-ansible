"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.testDiagnostics = exports.resetDefaultSettigs = exports.updateSettings = exports.getDocUri = exports.getDocPath = exports.sleep = exports.activate = exports.defaultAnsibleConfigurations = exports.editor = exports.doc = void 0;
var vscode = require("vscode");
var path = require("path");
var chai_1 = require("chai");
// Default ansible configurations
exports.defaultAnsibleConfigurations = [
    { 'ansible.useFullyQualifiedCollectionNames': true },
    { 'ansibleLint.arguments': '' },
    { 'ansibleLint.enabled': false },
    { 'ansibleLint.path': 'ansible-lint' },
    { 'ansibleNavigator.path': 'ansible-navigator' },
    { 'executionEnvironment.containerEngine': 'auto' },
    { 'executionEnvironment.enabled': false },
    {
        'executionEnvironment.image': 'quay.io/ansible/ansible-devtools-demo-ee:v0.1.0'
    },
    { 'executionEnvironment.pullPolicy': 'missing' },
    { 'python.activationScript': '' },
    { 'python.interpreterPath': 'python3' },
    { 'ansible.path': 'ansible' },
];
/**
 * Activates the redhat.ansible extension
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function activate(docUri) {
    return __awaiter(this, void 0, void 0, function () {
        var extension, activation, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    extension = vscode.extensions.getExtension('redhat.ansible');
                    return [4 /*yield*/, (extension === null || extension === void 0 ? void 0 : extension.activate())];
                case 1:
                    activation = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 7, , 8]);
                    return [4 /*yield*/, vscode.workspace.openTextDocument(docUri)];
                case 3:
                    exports.doc = _a.sent();
                    return [4 /*yield*/, vscode.window.showTextDocument(exports.doc, {
                            preview: true,
                            preserveFocus: false
                        })];
                case 4:
                    exports.editor = _a.sent();
                    return [4 /*yield*/, vscode.languages.setTextDocumentLanguage(exports.doc, 'ansible')];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, sleep(5000)];
                case 6:
                    _a.sent(); // Wait for server activation
                    return [2 /*return*/, activation];
                case 7:
                    e_1 = _a.sent();
                    console.error('Error from activation -> ', e_1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
exports.activate = activate;
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
exports.sleep = sleep;
var getDocPath = function (p) {
    return path.resolve(__dirname, path.join('..', '..', '..', 'src', 'test', 'testFixtures', p));
};
exports.getDocPath = getDocPath;
var getDocUri = function (p) {
    return vscode.Uri.file(exports.getDocPath(p));
};
exports.getDocUri = getDocUri;
function updateSettings(setting, value) {
    return __awaiter(this, void 0, void 0, function () {
        var ansibleConfiguration;
        return __generator(this, function (_a) {
            ansibleConfiguration = vscode.workspace.getConfiguration('ansible');
            return [2 /*return*/, ansibleConfiguration.update(setting, value, false)];
        });
    });
}
exports.updateSettings = updateSettings;
function resetDefaultSettigs() {
    return __awaiter(this, void 0, void 0, function () {
        var ansibleConfiguration;
        return __generator(this, function (_a) {
            ansibleConfiguration = vscode.workspace.getConfiguration('ansible');
            exports.defaultAnsibleConfigurations.forEach(function (config) {
                console.log(config);
            });
            return [2 /*return*/];
        });
    });
}
exports.resetDefaultSettigs = resetDefaultSettigs;
function testDiagnostics(docUri, expectedDiagnostics) {
    return __awaiter(this, void 0, void 0, function () {
        var actualDiagnostics;
        return __generator(this, function (_a) {
            actualDiagnostics = vscode.languages.getDiagnostics(docUri);
            chai_1.assert.strictEqual(actualDiagnostics.length, expectedDiagnostics.length);
            if (actualDiagnostics.length !== 0 && expectedDiagnostics.length !== 0) {
                expectedDiagnostics.forEach(function (expectedDiagnostic, i) {
                    var actualDiagnostic = actualDiagnostics[i];
                    chai_1.assert.include(actualDiagnostic.message, expectedDiagnostic.message); // subset of expected message
                    chai_1.assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
                    chai_1.assert.strictEqual(actualDiagnostic.severity, expectedDiagnostic.severity);
                });
            }
            return [2 /*return*/];
        });
    });
}
exports.testDiagnostics = testDiagnostics;
