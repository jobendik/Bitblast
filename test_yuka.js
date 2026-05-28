const YUKA = require('yuka');
const fl = new YUKA.FuzzyModule();
console.log('Has addFLV:', typeof fl.addFLV === 'function');
console.log('Has addVariable:', typeof fl.addVariable === 'function');
