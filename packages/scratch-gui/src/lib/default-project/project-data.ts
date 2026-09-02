import {TranslatorFunction} from '../../gui-config';

declare const require: any;
const projectJson = require('./project-data.json');

const projectData = (_translator?: TranslatorFunction) => JSON.parse(JSON.stringify(projectJson));

export default projectData;
