module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    "standard",
  ],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    semi: ["error", "always"],
    indent: ["error", 2],
    quotes: ["error", "double"],
    "jsx-quotes": ["error", "prefer-double"],
    "space-in-parens": ["error", "never"],
    "object-curly-spacing": ["error", "never"],
    "array-bracket-spacing": ["error", "never"],
    "comma-spacing": ["error", {
      before: false,
      after: true
    }],
    "arrow-spacing": ["error", {
      before: true,
      after: true
    }],
    "space-before-blocks": ["error", "always"],
    "spaced-comment": ["error", "always"],
    "block-spacing": ["error", "never"],
    "space-before-function-paren": ["error", "never"],
    "no-trailing-spaces": ["error", {ignoreComments: true}],
    "eol-last": ["error", "always"],
    "no-var": ["error"],
    "prefer-const": [
      "error",
      {
        destructuring: "all",
      },
    ],
    curly: ["error", "all"],
    "brace-style": ["error", "1tbs", {allowSingleLine: true}],
    "no-mixed-spaces-and-tabs": "error",
    "sort-imports": [
      "error",
      {
        ignoreDeclarationSort: true,
      },
    ],
    "no-multiple-empty-lines": [
      "error",
      {
        max: 1,
        maxBOF: 0,
        maxEOF: 0
      },
    ],
    "space-unary-ops": ["error", {
      words: true,
      nonwords: false
    }],
    "space-infix-ops": "error",
    "key-spacing": ["error", {
      beforeColon: false,
      afterColon: true
    }],
    "comma-style": ["error", "last"],
    "comma-dangle": [
      "error",
      {
        arrays: "always-multiline",
        objects: "always-multiline",
        imports: "never",
        exports: "never",
        functions: "never",
      },
    ],
    "no-multi-spaces": ["error", {ignoreEOLComments: true}],

    "react/prop-types": "off",
    "react/display-name": "off",
    "react/react-in-jsx-scope": "off",

    // don't use strict mod now, otherwise there are a lot of errors in the codebase
    "no-unused-vars": "off",
  },
};
