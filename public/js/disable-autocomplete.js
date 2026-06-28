/*
    Coffee Brew Tracker - browser autocomplete control

    Goal:
    - Disable browser-level autocomplete/autofill for normal textboxes.
    - Keep the Roaster database autosuggest working through the HTML datalist.
    - Roaster input must still have list="roasterSuggestions".
*/

(function () {
    function isTextLikeInput(input) {
        if (!input || input.tagName !== "INPUT") {
            return false;
        }

        const type = (input.getAttribute("type") || "text").toLowerCase();

        return [
            "text",
            "search",
            "email",
            "url",
            "tel",
            "number",
            "date",
            "time",
            "datetime-local",
            "month",
            "week"
        ].indexOf(type) >= 0;
    }

    function isRoasterInput(input) {
        if (!input || input.tagName !== "INPUT") {
            return false;
        }

        const name = (input.getAttribute("name") || "").toLowerCase();
        const id = (input.getAttribute("id") || "").toLowerCase();
        const list = (input.getAttribute("list") || "").toLowerCase();

        return name === "roastername" ||
            id === "roastername" ||
            id === "roasternameinput" ||
            list === "roastersuggestions";
    }

    function disableBrowserAutocompleteForElement(element) {
        if (!element) {
            return;
        }

        /*
            "off" disables browser autocomplete in most browsers.
            "new-password" is intentionally NOT used here because it can confuse
            non-password fields and password managers.
        */
        element.setAttribute("autocomplete", "off");
        element.setAttribute("autocapitalize", "off");
        element.setAttribute("autocorrect", "off");
        element.setAttribute("spellcheck", "false");
    }

    function applyAutocompleteRules() {
        const forms = document.querySelectorAll("form");

        forms.forEach(function (form) {
            form.setAttribute("autocomplete", "off");
        });

        const inputs = document.querySelectorAll("input");

        inputs.forEach(function (input) {
            if (!isTextLikeInput(input)) {
                return;
            }

            disableBrowserAutocompleteForElement(input);

            /*
                Important:
                Do NOT remove the datalist from Roaster.
                This keeps database autosuggest working while browser autocomplete stays off.
            */
            if (isRoasterInput(input)) {
                input.setAttribute("autocomplete", "off");

                if (!input.getAttribute("list")) {
                    input.setAttribute("list", "roasterSuggestions");
                }
            }
        });

        const textareas = document.querySelectorAll("textarea");

        textareas.forEach(function (textarea) {
            disableBrowserAutocompleteForElement(textarea);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyAutocompleteRules);
    } else {
        applyAutocompleteRules();
    }
})();
