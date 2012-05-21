/*
    Password Tags, extension for Firefox 3.6+ and others
    Copyright (C) 2012  Daniel Dawson <ddawson@icehouse.net>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var defaultFieldConfig = {
  _registered: false,
  _instantApply: false,
  _dirty: false,
  _ownDefaultChange: false,
  _ignoreSelect: false,

  init: function () {
    if (!this._registered) {
      el("defaultfieldconfig-addbtn").addEventListener("command", this, false);
      el("defaultfieldconfig-resetbtn").
        addEventListener("command", this, false);
      this._instantApply =
        this.brPrefs.getBoolPref("browser.preferences.instantApply");
      if (this._instantApply)
        signonMetadataStorage.addDefaultChangeListener(this);
      this._registered = true;
    }

    this._clearRows();

    var defaults = signonMetadataStorage.getDefaults();
    if (!defaults)
      this._resetRows();
    else
      for (let i = 0; i < defaults.length; i++) {
        let row = this._buildRow(defaults[i].name, defaults[i].type, i,
                                 i == defaults.length - 1);
        this._ignoreSelect = true;
        this.gridRows.appendChild(row);
      }
  },

  close: function () {
    if (this._registered)
      signonMetadataStorage.removeDefaultChangeListener(this);
  },

  handleEvent: function (aEvt) {
    var ctrl = aEvt.target;

    if (ctrl.id == "defaultfieldconfig-addbtn") {
      let defName = this.sharedStrings.getString("newFieldName");
      let row = this._buildRow(defName, "text",
                               this.gridRows.children.length - 1, true);
      this._ignoreSelect = true;
      this.gridRows.appendChild(row);
      if (this.gridRows.children.length > 2)
        row.previousElementSibling.firstChild.children[1].
          removeAttribute("disabled");

      this._updateDB_add(row);

      window.setTimeout(function () { row.children[1].select(); }, 1);
      return;
    } else if (ctrl.id == "defaultfieldconfig-resetbtn") {
      this._clearRows();
      this._resetRows();
      return;
    }

    var row = ctrl;
    while (row && row.tagName != "row") row = row.parentElement;
    if (!row) return false;

    if (ctrl.classList.contains("up-button")) {
      let prev = row.previousElementSibling;
      this._ignoreSelect = true;
      this.gridRows.insertBefore(row, prev);
      let idx = Number(row.getAttribute("index"));
      row.setAttribute("index", idx - 1);
      prev.setAttribute("index", idx);
      if (idx == 1) ctrl.setAttribute("disabled", "true");
      ctrl.nextSibling.removeAttribute("disabled");
      prev.firstChild.firstChild.removeAttribute("disabled");

      if (idx == this.gridRows.children.length - 2)
        prev.firstChild.children[1].setAttribute("disabled", "true");

      this._updateDB_move(idx, idx - 1);

      window.setTimeout(function () {
        if (ctrl.disabled)
          ctrl.nextSibling.focus();
        else
          ctrl.focus();
      }, 1);
    } else if (ctrl.classList.contains("down-button")) {
      let next = row.nextElementSibling;
      this._ignoreSelect = true;
      this.gridRows.insertBefore(next, row);
      let idx = Number(row.getAttribute("index"));
      row.setAttribute("index", idx + 1);
      next.setAttribute("index", idx);

      if (idx == this.gridRows.children.length - 3)
        ctrl.setAttribute("disabled", "true");

      ctrl.previousSibling.removeAttribute("disabled");
      next.firstChild.children[1].removeAttribute("disabled");

      if (idx == 0)
        next.firstChild.firstChild.setAttribute("disabled", "true");

      this._updateDB_move(idx, idx + 1);

      window.setTimeout(function () {
        if (ctrl.disabled)
          ctrl.previousSibling.focus();
        else
          ctrl.focus();
      }, 1);
    } else if (ctrl.classList.contains("remove-button")) {
      let idx = Number(row.getAttribute("index"));

      if (idx > 0 && idx == this.gridRows.children.length - 2)
        row.previousSibling.firstChild.children[1].
          setAttribute("disabled", "true");

      let next = row.nextElementSibling;

      if (idx == 0 && next)
        next.firstChild.firstChild.setAttribute("disabled", "true");

      while (next) {
        let idx = Number(next.getAttribute("index"));
        next.setAttribute("index", idx - 1);
        next = next.nextElementSibling;
      }
      this.gridRows.removeChild(row);

      this._updateDB_remove(idx);

      window.setTimeout(function () {
        var gr = defaultFieldConfig.gridRows, last = gr.children.length - 2;
        if (idx >= last) idx = last;

        if (idx >= 0)
          gr.children[idx + 1].children[1].select();
        else
          el("defaultfieldconfig-addbtn").focus();
      }, 1);
    } else if (ctrl.tagName == "textbox") {
      this._updateDB_edit(Number(row.getAttribute("index")), row);
    } else if (ctrl.tagName == "menulist") {
      if (this._ignoreSelect) {
        this._ignoreSelect = false;
        return;
      }

      this._updateDB_edit(Number(row.getAttribute("index")), row);
    }
  },

  _clearRows: function () {
    var row = this.gridRows.children[1];
    while (row) {
      let next = row.nextElementSibling;
      this.gridRows.removeChild(row);
      row = next;
    }
  },

  _resetRows: function () {
    var defName = this.strings.getString("preconfDefaultFieldName");
    var row = this._buildRow(defName, "mltext", 0, true);
    this._ignoreSelect = true;
    this.gridRows.appendChild(row);

    this._updateDB_reset();
  },

  _updateDB_add: function (aRow) {
    if (this._instantApply) {
      this._ownDefaultChange = true;
      signonMetadataStorage.insertDefaultField(
        -1, aRow.children[1].value, aRow.children[2].value);
    } else
      this._dirty = true;
  },

  _updateDB_move: function (aOldIdx, aNewIdx) {
    if (this._instantApply) {
      this._ownDefaultChange = true;
      signonMetadataStorage.moveDefaultField(aOldIdx, aNewIdx);
    } else
      this._dirty = true;
  },

  _updateDB_remove: function (aIdx) {
    if (this._instantApply) {
      this._ownDefaultChange = true;
      signonMetadataStorage.removeDefaultField(aIdx);
    } else
      this._dirty = true;
  },

  _updateDB_edit: function (aIdx, aRow) {
    if (this._instantApply) {
      this._ownDefaultChange = true;
      signonMetadataStorage.replaceDefaultField(
        aIdx, aRow.children[1].value, aRow.children[2].value);
    } else
      this._dirty = true;
  },

  _updateDB_reset: function () {
    this._dirty = true;
    if (this._instantApply) {
      this._ownDefaultChange = true;
      this.applyChanges();
    }
  },

  handleDefaultChange: function () {
    if (!this._ownDefaultChange)
      this.init();
    else
      this._ownDefaultChange = false;
  },

  _buildRow: function (aName, aType, aIdx, aIsLast) {
    let row = document.createElement("row");
    row.setAttribute("index", aIdx);
    let box = document.createElement("hbox");
    let btn = document.createElement("button");
    btn.classList.add("up-button");
    btn.setAttribute("tooltiptext",
                     this.sharedStrings.getString("moveUp.tooltip"));
    btn.addEventListener("command", this, false);
    if (aIdx == 0) btn.setAttribute("disabled", "true");
    box.appendChild(btn);
    btn = document.createElement("button");
    btn.classList.add("down-button");
    btn.setAttribute("tooltiptext",
                     this.sharedStrings.getString("moveDown.tooltip"));
    btn.addEventListener("command", this, false);
    if (aIsLast) btn.setAttribute("disabled", "true");
    box.appendChild(btn);
    row.appendChild(box);

    let fld = document.createElement("textbox");
    fld.setAttribute("type", "text");
    fld.setAttribute("tooltiptext",
                     this.sharedStrings.getString("nameField.tooltip"));
    fld.setAttribute("value", aName);
    fld.addEventListener("change", this, false);
    row.appendChild(fld);

    let lst = document.createElement("menulist");
    lst.setAttribute("value", aType);
    lst.setAttribute("tooltiptext",
                     this.sharedStrings.getString("typeList.tooltip"));
    let pop = document.createElement("menupopup");
    let item = document.createElement("menuitem");
    item.setAttribute("label",
                      this.sharedStrings.getString("type_text.label"));
    item.setAttribute("tooltiptext",
                      this.sharedStrings.getString("type_text.tooltip"));
    item.setAttribute("value", "text");
    pop.appendChild(item);
    item = document.createElement("menuitem");
    item.setAttribute("label",
                      this.sharedStrings.getString("type_mltext.label"));
    item.setAttribute("tooltiptext",
                      this.sharedStrings.getString("type_mltext.tooltip"));
    item.setAttribute("value", "mltext");
    pop.appendChild(item);
    item = document.createElement("menuitem");
    item.setAttribute("label",
                      this.sharedStrings.getString("type_number.label"));
    item.setAttribute("tooltiptext",
                      this.sharedStrings.getString("type_number.tooltip"));
    item.setAttribute("value", "number");
    pop.appendChild(item);
    lst.appendChild(pop);
    lst.addEventListener("select", this, false);
    row.appendChild(lst);

    btn = document.createElement("button");
    btn.classList.add("remove-button");
    btn.setAttribute("tooltiptext",
                     this.sharedStrings.getString("remove.tooltip"));
    btn.addEventListener("command", this, false);
    row.appendChild(btn);
    return row;
  },

  applyChanges: function () {
    if (this._dirty) {
      this._dirty = false;

      let defaults = [], rows = this.gridRows.children, curRow = rows[1];
      while (curRow) {
        let c = curRow.children;
        let curDefault = { name: c[1].value, type: c[2].value };
        defaults.push(curDefault);
        curRow = curRow.nextElementSibling;
      }

      signonMetadataStorage.setDefaults(defaults);
    }

    return true;
  },
};

XPCOMUtils.defineLazyGetter(
  defaultFieldConfig, "strings",
  function () el("defaultfieldconfig-strings"));
XPCOMUtils.defineLazyGetter(
  defaultFieldConfig, "sharedStrings",
  function () el("defaultfieldconfig-shared-strings"));
XPCOMUtils.defineLazyGetter(
  defaultFieldConfig, "gridRows",
  function () el("defaultfieldconfig-gridrows"));
XPCOMUtils.defineLazyServiceGetter(
  defaultFieldConfig, "prefSvc",
  "@mozilla.org/preferences-service;1", "nsIPrefService");
XPCOMUtils.defineLazyGetter(
  defaultFieldConfig, "brPrefs",
  function () defaultFieldConfig.prefSvc.getBranch(""));
XPCOMUtils.defineLazyGetter(
  defaultFieldConfig, "prefs",
  function () defaultFieldConfig.prefSvc.getBranch("extensions.passwordtags.").
              QueryInterface(Ci.nsIPrefBranch2));
