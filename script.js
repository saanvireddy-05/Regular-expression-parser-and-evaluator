class Token {
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
}

class Lexer {
    constructor(regex) {
        this.regex = regex;
        this.tokens = [];
        this.tokenize();
    }

    tokenize() {
        let i = 0;
        while (i < this.regex.length) {
            let char = this.regex[i];
            if (/\d/.test(char)) {
                this.tokens.push(new Token("NUMBER", char));
            } else if ("|*+()?".includes(char)) {
                this.tokens.push(new Token("OPERATOR", char));
            } else if (char === "[") {
                let j = i + 1;
                while (j < this.regex.length && this.regex[j] !== "]") j++;
                if (j < this.regex.length) {
                    this.tokens.push(new Token("CHAR_CLASS", this.regex.slice(i, j + 1)));
                    i = j;
                } else {
                    throw new Error("Unclosed character class");
                }
            } else if (char === "\\") {
                if (i + 1 < this.regex.length) {
                    this.tokens.push(new Token("ESCAPE", "\\" + this.regex[i + 1]));
                    i++;
                } else {
                    throw new Error("Incomplete escape sequence");
                }
            } else if (!" \t\n\r".includes(char)) {
                this.tokens.push(new Token("CHAR", char));
            }
            i++;
        }
    }

    getTokens() {
        return this.tokens;
    }
}
class RegexNode {
    constructor(type, value = null, children = []) {
        this.type = type;
        this.value = value;
        this.children = children;
    }

    display(indent = 0, isLast = true) {
        let connector = isLast ? "└─" : "├─";
        let typeLabel = this.getTypeLabel();
        let valueLabel = this.value !== null ? `: ${this.value}` : "";
        let treeDisplay = "  ".repeat(indent) + connector + typeLabel + valueLabel + "\n";

        this.children.forEach((child, index) => {
            if (child instanceof RegexNode) {
                let isLastChild = index === this.children.length - 1;
                treeDisplay += child.display(indent + 1, isLastChild);
            } else {
                treeDisplay += "  ".repeat(indent + 1) + (index === this.children.length - 1 ? "└─" : "├─") + child.toString() + "\n";
            }
        });

        return treeDisplay;
    }

    getTypeLabel() {
        switch (this.type) {
            case "CHAR": return "char";
            case "NUMBER": return "number";
            case "OPERATOR": return "operator";
            case "CHAR_CLASS": return "char_class";
            case "ESCAPE": return "escape";
            case "CONCAT": return "concat";
            case "OR": return "or";
            case "STAR": return "star";
            case "PLUS": return "plus";
            case "QUESTION": return "question";
            default: return this.type;
        }
    }
} 

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.index = 0;
    }

    parse() {
        return this.parseExpression();
    }

    parseExpression() {
        let left = this.parseConcatenation();
        while (this.match("OPERATOR", "|")) {
            let right = this.parseConcatenation();
            left = new RegexNode("OR", null, [left, right]);
        }
        return left;
    }

    parseConcatenation() {
        let nodes = [];
        while (this.index < this.tokens.length && !["|", ")"].includes(this.tokens[this.index].value)) {
            nodes.push(this.parseTerm());
        }
        return nodes.length > 1 ? new RegexNode("CONCAT", null, nodes) : nodes[0];
    }

    parseTerm() {
        let node = null;
        if (this.match("OPERATOR", "(")) {
            node = this.parseExpression();
            this.expect("OPERATOR", ")");
        } else if (["CHAR", "CHAR_CLASS", "ESCAPE", "NUMBER"].includes(this.tokens[this.index].type)) {
            node = new RegexNode(this.tokens[this.index].type, this.tokens[this.index].value);
            this.index++;
        }

        while (this.match("OPERATOR", "*") || this.match("OPERATOR", "+") || this.match("OPERATOR", "?")) {
            let op = this.tokens[this.index - 1].value;
            node = new RegexNode(op.toUpperCase(), null, [node]);
        }
        return node;
    }

    match(type, value = null) {
        if (this.index < this.tokens.length &&
            this.tokens[this.index].type === type &&
            (value === null || this.tokens[this.index].value === value)) {
            this.index++;
            return true;
        }
        return false;
    }

    expect(type, value = null) {
        if (!this.match(type, value)) {
            throw new Error(`Expected ${value}, found ${this.tokens[this.index]?.value || "EOF"}`);
        }
    }
}
class NFAState {
    constructor(id) {
        this.id = id;
        this.transitions = {};
        this.epsilonTransitions = [];
    }

    addTransition(symbol, state) {
        if (!this.transitions[symbol]) {
            this.transitions[symbol] = [];
        }
        this.transitions[symbol].push(state);
    }

    addEpsilonTransition(state) {
        this.epsilonTransitions.push(state);
    }

    toString() {
        return `s${this.id}`;
    }
}

class NFA {
    constructor(start, accept) {
        this.start = start;
        this.accept = accept;
        this.stateCounter = 0;
    }

    createState() {
        return new NFAState(this.stateCounter++);
    }

    static fromRegexTree(tree) {
        const nfa = new NFA();
        let start, accept;

        if (tree.value === "concat") {
            let nfa1 = NFA.fromRegexTree(tree.children[0]);
            let nfa2 = NFA.fromRegexTree(tree.children[1]);
            nfa1.accept.addEpsilonTransition(nfa2.start);
            return new NFA(nfa1.start, nfa2.accept);
        } else if (tree.value === "|") {
            start = nfa.createState();
            accept = nfa.createState();
            let nfa1 = NFA.fromRegexTree(tree.children[0]);
            let nfa2 = NFA.fromRegexTree(tree.children[1]);
            start.addEpsilonTransition(nfa1.start);
            start.addEpsilonTransition(nfa2.start);
            nfa1.accept.addEpsilonTransition(accept);
            nfa2.accept.addEpsilonTransition(accept);
            return new NFA(start, accept);
        } else if (tree.value === "*") {
            start = nfa.createState();
            accept = nfa.createState();
            let nfa1 = NFA.fromRegexTree(tree.children[0]);
            start.addEpsilonTransition(nfa1.start);
            start.addEpsilonTransition(accept);
            nfa1.accept.addEpsilonTransition(nfa1.start);
            nfa1.accept.addEpsilonTransition(accept);
            return new NFA(start, accept);
        } else if (tree.value === "+") {
            start = nfa.createState();
            accept = nfa.createState();
            let nfa1 = NFA.fromRegexTree(tree.children[0]);
            start.addEpsilonTransition(nfa1.start);
            nfa1.accept.addEpsilonTransition(nfa1.start);
            nfa1.accept.addEpsilonTransition(accept);
            return new NFA(start, accept);
        } else if (tree.value === "?") {
            start = nfa.createState();
            accept = nfa.createState();
            let nfa1 = NFA.fromRegexTree(tree.children[0]);
            start.addEpsilonTransition(nfa1.start);
            start.addEpsilonTransition(accept);
            nfa1.accept.addEpsilonTransition(accept);
            return new NFA(start, accept);
        } else if (tree.value.startsWith("[") && tree.value.endsWith("]")) {
            start = nfa.createState();
            accept = nfa.createState();
            const charClass = tree.value.slice(1, -1).split("").map(c => {
                let state = nfa.createState();
                start.addTransition(c, state);
                state.addEpsilonTransition(accept);
                return state;
            });
            return new NFA(start, accept);
        } else if (tree.value.startsWith("\\") || tree.value.length === 1) {
            start = nfa.createState();
            accept = nfa.createState();
            start.addTransition(tree.value, accept);
            return new NFA(start, accept);
        }

        return nfa;
    }

    display() {
        const visited = new Set();
        let transitions = [];

        const displayTransitions = (state) => {
            if (visited.has(state.id)) return;
            visited.add(state.id);

            for (const [symbol, states] of Object.entries(state.transitions)) {
                states.forEach(s => {
                    transitions.push(`${state} -- ${symbol} --> ${s}`);
                    displayTransitions(s);
                });
            }
            state.epsilonTransitions.forEach(s => {
                transitions.push(`${state} -- ε --> ${s}`);
                displayTransitions(s);
            });
        };

        displayTransitions(this.start);
        return transitions.join("\n");
    }
}

function evaluate(pattern, testString) {
    try {
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(testString);
    } catch (e) {
        return false;
    }
}

function processRegex() {
    const regexPattern = document.getElementById('regexPattern').value;
    const testString = document.getElementById('testString').value;

    try {
        const lexer = new Lexer(regexPattern);
        const tokens = lexer.getTokens();

        const match = evaluate(regexPattern, testString);
        document.getElementById('matchResult').textContent = match ? "Matched ✅" : "Not Matched ❌";

        document.getElementById('tokens').style.display = 'none';
        document.getElementById('parseTree').style.display = 'none';

    } catch (error) {
        document.getElementById('matchResult').textContent = `Error: ${error.message}`;
    }
}

function showTokens() {
    const tokensSection = document.getElementById('tokens');
    const regexPattern = document.getElementById('regexPattern').value;

    if (tokensSection.style.display === 'none' || tokensSection.style.display === '') {
        const lexer = new Lexer(regexPattern);
        const tokens = lexer.getTokens();
        tokensSection.textContent = JSON.stringify(tokens, null, 2);
        tokensSection.style.display = 'block';
    } else {
        tokensSection.style.display = 'none';
    }
}

function showParseTree() {
    const parseTreeSection = document.getElementById('parseTree');
    const regexPattern = document.getElementById('regexPattern').value;
    const lexer = new Lexer(regexPattern);
    const tokens = lexer.getTokens();
    const parser = new Parser(tokens);
    const parseTree = parser.parse();

    if (parseTreeSection.style.display === 'none' || parseTreeSection.style.display === '') {
        parseTreeSection.textContent = parseTree.display();
        parseTreeSection.style.display = 'block';
    } else {
        parseTreeSection.style.display = 'none';
    }
}