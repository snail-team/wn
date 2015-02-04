var fis = module.exports = require('fis');

fis.cli.name = 'wn';
fis.cli.info = fis.util.readJSON(__dirname + '/package.json');

//定义插件前缀，允许加载scrat-xxx-xxx插件，或者fis-xxx-xxx插件，
//这样可以形成scrat自己的插件系统
fis.require.prefixes = [ 'wn', 'fis' ];

//把前面的配置都写在这里统一管理
//项目中就不用再写了
//fis.config.set('modules.preprocessor.tpl', require('./plugins/preprocessor/parseWidget.js'));