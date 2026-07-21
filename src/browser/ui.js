import {EditorState} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers
} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting
} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
import {lintGutter, linter, lintKeymap} from "@codemirror/lint";
import {json, jsonParseLinter} from "@codemirror/lang-json";

const editors = {};
const validateButton = document.getElementById("validate");
const validResult = document.getElementById("valid");
const failedResult = document.getElementById("failed");
const results = document.getElementById("results");
const parseLinter = jsonParseLinter();
const cspNonce = document.querySelector('meta[name="biovalidator-csp-nonce"]')?.content || "";
const enabledTooltipDelay = 1500;
const disabledTooltipDelay = 300;
let visibleTooltip = null;

function hideTooltip(control) {
  window.clearTimeout(control.tooltipTimer);
  control.tooltipTimer = null;
  control.tooltip.hidden = true;
  if (visibleTooltip === control) {
    visibleTooltip = null;
  }
}

function showTooltip(control) {
  if (visibleTooltip && visibleTooltip !== control) {
    hideTooltip(visibleTooltip);
  }
  control.tooltip.textContent = control.button.dataset.tooltip || "";
  if (!control.tooltip.textContent) {
    return;
  }
  control.tooltip.hidden = false;
  visibleTooltip = control;
}

function scheduleTooltip(control) {
  hideTooltip(control);
  const delay = control.button.disabled ? disabledTooltipDelay : enabledTooltipDelay;
  control.tooltipTimer = window.setTimeout(() => showTooltip(control), delay);
}

function syncTooltipControl(button) {
  const control = button.tooltipControl;
  if (!control) {
    return;
  }
  control.wrapper.tabIndex = button.disabled ? 0 : -1;
  if (button.disabled) {
    control.wrapper.setAttribute("aria-label", `${button.textContent}. ${button.dataset.tooltip}`);
  } else {
    control.wrapper.removeAttribute("aria-label");
  }
  hideTooltip(control);
}

function setButtonState(button, {disabled = button.disabled, tooltip = button.dataset.tooltip || ""} = {}) {
  button.disabled = disabled;
  button.dataset.tooltip = tooltip;
  syncTooltipControl(button);
}

function addButtonTooltip(button) {
  const wrapper = document.createElement("span");
  wrapper.className = "tooltip-control";
  const tooltip = document.createElement("span");
  tooltip.className = "button-tooltip";
  tooltip.id = `tooltip-${Math.random().toString(36).slice(2)}`;
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  button.parentNode.insertBefore(wrapper, button);
  wrapper.append(button, tooltip);
  button.setAttribute("aria-describedby", tooltip.id);
  const control = {button, wrapper, tooltip, tooltipTimer: null};
  button.tooltipControl = control;
  wrapper.addEventListener("mouseenter", () => scheduleTooltip(control));
  wrapper.addEventListener("mouseleave", () => hideTooltip(control));
  wrapper.addEventListener("focusin", () => scheduleTooltip(control));
  wrapper.addEventListener("focusout", () => hideTooltip(control));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip(control);
    }
  });
  button.addEventListener("click", () => hideTooltip(control));
  syncTooltipControl(button);
}

function editorText(editor) {
  return editor.view.state.doc.toString();
}

function setEditorStatus(editor, state, message) {
  editor.valid = state === "valid";
  editor.status.textContent = message;
  editor.status.classList.toggle("text-danger", state === "invalid");
  editor.status.classList.toggle("text-success", state === "valid");
  editor.status.classList.toggle("text-muted", state === "empty" || state === "checking");
  editor.host.classList.toggle("is-invalid", state === "invalid");
  const formatTooltip = state === "empty"
    ? "Enter JSON before formatting."
    : editor.valid
      ? "Format this JSON with two-space indentation."
      : "Fix the JSON syntax before formatting.";
  setButtonState(editor.formatButton, {disabled: !editor.valid, tooltip: formatTooltip});
  updateValidateButton();
}

function updateValidateButton() {
  const ready = editors.schema && editors.data && editors.schema.valid && editors.data.valid;
  setButtonState(validateButton, {
    disabled: !ready,
    tooltip: ready
      ? "Validate the data against this JSON Schema."
      : "Check the JSON syntax in both editors before validating."
  });
}

function createJsonEditor(name) {
  const textarea = document.querySelector(`[data-json-editor="${name}"]`);
  const host = document.getElementById(`${name}-editor`);
  const status = document.getElementById(`${name}-status`);
  const formatButton = document.querySelector(`[data-format-editor="${name}"]`);
  const editor = {name, textarea, host, status, formatButton, valid: false, view: null};
  editors[name] = editor;

  const lintSource = (view) => {
    const text = view.state.doc.toString();
    if (!text.trim()) {
      setEditorStatus(editor, "empty", "JSON is required.");
      return [];
    }
    const diagnostics = parseLinter(view);
    if (diagnostics.length) {
      setEditorStatus(editor, "invalid", diagnostics[0].message);
    } else {
      setEditorStatus(editor, "valid", "Valid JSON syntax.");
    }
    return diagnostics;
  };

  const formatCommand = () => {
    formatEditor(editor);
    return true;
  };

  editor.view = new EditorView({
    doc: textarea.value,
    parent: host,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      json(),
      lintGutter(),
      linter(lintSource, {delay: 500}),
      indentUnit.of("  "),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": name === "schema" ? "JSON Schema editor" : "JSON data editor",
        "aria-describedby": `${name}-status`
      }),
      ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          textarea.value = update.state.doc.toString();
          const state = textarea.value.trim() ? "checking" : "empty";
          const message = state === "checking" ? "Checking JSON syntax…" : "JSON is required.";
          setEditorStatus(editor, state, message);
        }
      }),
      keymap.of([
        {key: "Shift-Alt-f", run: formatCommand},
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...lintKeymap
      ])
    ]
  });

  textarea.hidden = true;
  formatButton.addEventListener("click", formatCommand);
  setEditorStatus(editor, "empty", "JSON is required.");
  return editor;
}

function formatEditor(editor) {
  try {
    const formatted = JSON.stringify(JSON.parse(editorText(editor)), null, 2);
    const cursor = Math.min(editor.view.state.selection.main.head, formatted.length);
    editor.view.dispatch({
      changes: {from: 0, to: editor.view.state.doc.length, insert: formatted},
      selection: {anchor: cursor}
    });
    editor.view.focus();
  } catch (error) {
    setEditorStatus(editor, "invalid", error.message);
    editor.view.focus();
  }
}

function setEditorText(editor, text) {
  editor.view.dispatch({
    changes: {from: 0, to: editor.view.state.doc.length, insert: text},
    selection: {anchor: 0}
  });
}

function setExamplesMessage(message, isError = false) {
  const element = document.getElementById("examples-message");
  element.textContent = message || "";
  element.classList.toggle("text-danger", isError);
  element.classList.toggle("text-muted", !isError);
}

function setValidationResult(state) {
  validResult.hidden = state !== "valid";
  failedResult.hidden = state !== "invalid";
}

function appendValidationErrors(response) {
  const list = document.createElement("ul");
  response.forEach((entry) => {
    const item = document.createElement("li");
    item.append(document.createTextNode(entry.dataPath || entry.instancePath || "Document"));
    const messages = Array.isArray(entry.errors) ? entry.errors : [];
    if (messages.length) {
      const details = document.createElement("ul");
      messages.forEach((message) => {
        const detail = document.createElement("li");
        detail.textContent = typeof message === "string" ? message : JSON.stringify(message);
        details.append(detail);
      });
      item.append(details);
    } else if (entry.message) {
      item.append(document.createTextNode(`: ${entry.message}`));
    }
    list.append(item);
  });
  results.append(list);
}

async function responseMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return JSON.stringify(await response.json());
  }
  return await response.text();
}

function endpoint(relativeUrl) {
  return new URL(relativeUrl, document.baseURI).toString();
}

async function validateDocuments() {
  results.replaceChildren();
  setValidationResult(null);
  let schema;
  let data;
  try {
    schema = JSON.parse(editorText(editors.schema));
    data = JSON.parse(editorText(editors.data));
  } catch (error) {
    setValidationResult("invalid");
    results.textContent = `Unable to parse the JSON input: ${error.message}`;
    return;
  }

  setButtonState(validateButton, {disabled: true, tooltip: "Validation is in progress."});
  validateButton.textContent = "Validating…";
  try {
    const response = await fetch(endpoint("validate"), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({schema, data})
    });
    if (!response.ok) {
      throw new Error(await responseMessage(response));
    }
    const validationErrors = await response.json();
    if (validationErrors.length === 0) {
      setValidationResult("valid");
    } else {
      setValidationResult("invalid");
      appendValidationErrors(validationErrors);
    }
  } catch (error) {
    setValidationResult("invalid");
    results.textContent = error.message || "Validation request failed.";
  } finally {
    validateButton.textContent = "Validate";
    updateValidateButton();
  }
}

function populateExamples(payload) {
  const examples = payload.examples || [];
  const select = document.getElementById("example-select");
  const loadButton = document.getElementById("load-example");
  select.replaceChildren();
  select.examples = examples;
  if (!examples.length) {
    select.append(new Option("No FEGA examples available", ""));
    select.disabled = true;
    loadButton.classList.remove("example-ready");
    setButtonState(loadButton, {disabled: true, tooltip: "Fetch examples, then select one to load."});
    setExamplesMessage("No minimal valid FEGA examples were returned.", true);
    return;
  }
  examples.forEach((example) => select.append(new Option(`${example.entity}: ${example.name}`, example.id)));
  select.disabled = false;
  updateLoadExampleButton();
  setExamplesMessage(`Loaded ${examples.length} minimal valid FEGA examples.`);
}

function updateLoadExampleButton() {
  const select = document.getElementById("example-select");
  const loadButton = document.getElementById("load-example");
  const selected = (select.examples || []).some((example) => example.id === select.value);
  loadButton.classList.toggle("example-ready", selected);
  setButtonState(loadButton, {
    disabled: !selected,
    tooltip: selected
      ? "Load the selected example into both editors."
      : "Fetch examples, then select one to load."
  });
}

async function fetchExamples() {
  const select = document.getElementById("example-select");
  const loadButton = document.getElementById("load-example");
  const fetchButton = document.getElementById("fetch-examples");
  const previousButtonText = fetchButton.textContent;
  let fetched = false;
  select.disabled = true;
  loadButton.classList.remove("example-ready");
  setButtonState(loadButton, {disabled: true, tooltip: "Examples are being fetched."});
  setButtonState(fetchButton, {disabled: true, tooltip: "Examples are being fetched."});
  fetchButton.textContent = "Fetching…";
  setExamplesMessage("Loading FEGA examples…");
  try {
    const response = await fetch(endpoint("examples?refresh=true"));
    if (!response.ok) {
      throw new Error("Examples request failed.");
    }
    populateExamples(await response.json());
    fetchButton.textContent = "Refresh examples";
    fetched = true;
  } catch (error) {
    select.replaceChildren(new Option("FEGA examples unavailable", ""));
    select.examples = [];
    loadButton.classList.remove("example-ready");
    setButtonState(loadButton, {disabled: true, tooltip: "Fetch examples, then select one to load."});
    setExamplesMessage("Unable to load FEGA examples from this endpoint.", true);
  } finally {
    if (!fetched) {
      fetchButton.textContent = previousButtonText;
    }
    setButtonState(fetchButton, {
      disabled: false,
      tooltip: fetched || fetchButton.textContent === "Refresh examples"
        ? "Refresh the examples from the source."
        : "Fetch minimal valid FEGA examples."
    });
  }
}

function loadSelectedExample() {
  const select = document.getElementById("example-select");
  const example = (select.examples || []).find((candidate) => candidate.id === select.value);
  if (!example) {
    setExamplesMessage("Select a FEGA example to load.", true);
    return;
  }
  setEditorText(editors.schema, JSON.stringify(example.schema, null, 2));
  setEditorText(editors.data, JSON.stringify(example.data, null, 2));
  setExamplesMessage(`Loaded ${example.name}.`);
}

function initialise() {
  document.querySelectorAll("[data-tooltip]").forEach(addButtonTooltip);
  createJsonEditor("schema");
  createJsonEditor("data");
  document.getElementById("example-select").disabled = true;
  setButtonState(document.getElementById("load-example"), {
    disabled: true,
    tooltip: "Fetch examples, then select one to load."
  });
  setExamplesMessage("Fetch FEGA examples when you want to load or refresh the list.");
  document.getElementById("fetch-examples").addEventListener("click", fetchExamples);
  document.getElementById("load-example").addEventListener("click", loadSelectedExample);
  document.getElementById("example-select").addEventListener("change", updateLoadExampleButton);
  validateButton.addEventListener("click", validateDocuments);
}

initialise();
