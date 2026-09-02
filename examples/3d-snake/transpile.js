const fs = require('fs');
const path = require('path');
const ts = require('typescript');

let src = fs.readFileSync(path.join(__dirname, 'project-data.ts'), 'utf8');
src = src.replace(
    /import projectDataMessages[\s\S]*?const messages = \{\.\.\.projectDataMessages, \.\.\.sharedMessages\};/,
    `const messages = {
    costume: {defaultMessage: 'costume'},
    meow: {defaultMessage: 'Meow'},
    backdrop: {defaultMessage: 'backdrop'},
    pop: {defaultMessage: 'pop'},
    sprite: {defaultMessage: 'Sprite'},
    variable: {defaultMessage: 'my variable'}
};`
);
src = src.replace(/import \{MessageObject, TranslatorFunction\} from [^;]+;/, '');
src = src.replace(/: TranslatorFunction/g, '');

const out = ts.transpileModule(src, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        skipLibCheck: true
    }
});
fs.writeFileSync(path.join(__dirname, 'project-data.cjs'), out.outputText);
console.log('wrote project-data.cjs', out.outputText.length);
