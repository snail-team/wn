var fis = module.exports = require('fis');

fis.cli.name = 'wn';
fis.cli.info = fis.util.readJSON(__dirname + '/package.json');
fis.cli.help.commands = [ 'release', 'install', 'server', 'init' ];
fis.cli.version = require('./version.js');

//定义插件前缀，允许加载wn-xxx-xxx插件，或者fis-xxx-xxx插件，
//这样可以形成wn自己的插件系统
fis.require.prefixes = [ 'wn', 'fis' ];

//把项目的配置都写在这里统一管理
//fis.config.set('modules.preprocessor.tpl', require('./plugins/preprocessor/parseWidget.js'));

fis.config.set('snailGames.json','https://raw.githubusercontent.com/snail-team/wn-data/master/snailGames.json');
//使用wn-parser-component插件解析views目录下的**.tpl文件，解析<!--component('xxx')-->
// 或者<!--component("xxx@version")-->为一个组件的引用
fis.config.merge({
    roadmap : {
        ext : {
            md : 'html'
        }
    },
    modules : {
        parser : {
            md : 'marked',
            html : 'component',
            css:'component'
        }
    }
});

//运行js amd 包装插件
fis.config.merge({
    settings : {
        postprocessor : {
            jswrapper : {
                //wrap type. if omitted, it will wrap js file with '(function(){...})();'.
                type : 'amd'
                //you can use template also, ${content} means the file content
                //template : '!function(){${content}}();',
                //wrap all js file, default is false, wrap modular js file only.
                //wrapAll : true
            }
        }
    }
});
//运行打包插件，自动将页面中独立的资源引用替换为打包资源
//fis.config.set('modules.postpackager', 'simple');
//通过pack设置干预自动合并结果，将公用资源合并成一个文件，更加利于页面间的共用

//Step 2. 取消下面的注释开启pack人工干预
//fis.config.set('pack', {
//    'pkg/lib.js': [
//        '/components_modules/**.js'
//    ],
//    release:'/'+fis.config.get('name')+'/static/'
//});

//Step 3. 取消下面的注释可以开启simple对零散资源的自动合并
//fis.config.set('settings.postpackager.simple.autoCombine', true);
/*待node模块化的函数*/
Array.prototype.distinct = function(){
    var newArr=[],obj={};
    for(var i=0,len=this.length;i<len;i++){
        if(!obj[typeof(this[i]) + this[i]]){
            newArr.push(this[i]);
            obj[typeof(this[i])+this[i]]='new';
        }
    }
    return newArr;
};
function stringObj(obj){
    return JSON.stringify(obj, null, 4);
}

function parsePath(path){
    var path=normalizePath(path),
        pathArr=path.split('/'),
        pathObj={dir:'',fileName:'',extName:''};

    for(var i= 0,L=pathArr.length;i<L;i++){
        if(i<L-1){
            pathObj.dir+=pathArr[i]+'/';
        }else{
            pathObj.fileName=pathArr[i].split('.')[0];
            pathObj.extName=pathArr[i].split('.')[1];
        }
    }
    function normalizePath(path){
        return path.replace(/\\/g,'/');
    }
    return pathObj;
}
/*待node模块化的函数结束*/
//postpackager插件接受4个参数，
//ret包含了所有项目资源以及资源表、依赖树，其中包括：
//   ret.src: 所有项目文件对象
//   ret.pkg: 所有项目打包生成的额外文件
//   ret.map: 资源表结构化数据
//其他参数暂时不用管
var bulidWn = function(ret, conf, settings, opt){
    var map = {};
    map.deps = {};
    //别名收集表
    map.alias = {};
    //组件别名收集表
    map.componentsAlias = {};
    //组件收集表
    map.components = {};
    //模板组件依赖表
    map.templateDeps = {};
    //模板组件包
    map.pkg={};
    /*
     *1.建立一个components别名表componentsAliasMap对象，目的是建立一个所有组件的别名信息表，规则是该文件需在
     *components或者component_modules或者spm_modules目录下目录下。
     *如果是components下的组件，则为本地组件，文件名和文件夹同名，则建立别名： 【模块名：模块的文件夹】,
     *本地组件可以和远程的组件重名，只是发布组件的时候，如果发现线上已经有相应名字的组件时，则只能换个名字发布；
     *如果是spm_modules目录下的组件，则建立别名：【模块名：模块的文件夹】，因为默认是从spm下安装组件，所以默认
     *所有spm_modules目录下的组件不需要在别名前面加标识区分，其他组件库安装的组件需要；
     *如果是component_modules目录下的组件，则在前面加上component/加以区分【component/模块名：模块的文件夹】，以免和spm_modules里的组件冲突；
     componentsAliasMap={
     "a": "a/",
     "b@1.0.0": "spm_modules/b/1.0.0/"，
     "component/b@1.0.0": "component_modules/b/1.0.0/"
     }
     */
    fis.util.map(ret.src, function(subpath, file){
        //添加判断，只有components和spm_modules目录下的文件才需要建立依赖树或别名
        if(file.isComponents || file.isSpmModules ){
            //判断一下文件名和文件夹是否同名,包括有版本号的情况，如果同名则建立一个别名
            //var match = subpath.match(/^\/components\/(.*?([^\/]+))\/\2\.js$/i);
            var componentsAliasName=getComponentsAliasName(subpath);

            //初始化componentsAliasMap
            if(componentsAliasName && !map.componentsAlias.hasOwnProperty(componentsAliasName)){
                map.componentsAlias[componentsAliasName] = componentsAliasName.replace(/@/g,'/')+'/';
                //初始化组件对象，其中只有js是数组类型，html、css因为可以用fis的文件内嵌__inline合并成一个文件
                //所以也不需要数组，init不可能有多个也不需要数组,先暂定为数组 todo
                map.components[componentsAliasName]={html:'',css:'',js:[],init:''};
            }
            //初始化depsMap
            if(file.requires && file.requires.length){
                map.deps[file.id] = file.requires;
            }

        }
    });
    /*
     * 2.建立一个组件结构表componentsMap对象，目前默认安装的是spm组件，所以默认spm_modules里的组件就根据组件里的package.json去分析资源
     * spm包默认的功能定义是提供某个单一的功能，比如一个特定功能的js，一段特定的css（spm.main 	the only entry point of the package,
     * default index.js, or could be set to index.css for a css-only package ），但是这次我们的构想是一个组件应该是一个html、css、js、图片的
     * 随机结合，所以需在他的包里做些扩展定义，spm.main定义保持不变，可以是js，可以是css，但不能是html，不然导致肯定该组件其他使用seajs加载的报错，
     * 凡是包里的名为index或与组件同名的html，css，init.js,解析为该包的html，js，init入口文件，spm.main指定的是给seajs加载时使用的模块
     componentsMap={
     'a':{
     html:'/a/a.html'
     css:'/a/a.css','/a/aa.css',
     js:['/a/a.js','/a/aa.js'],
     init:'/a/a.init.js',
     deps:['b@version','c']
     },
     'b@version':{
     html:'/b/version/b.html'
     css:'/b/version/a.css'
     js:['/a/version/a.js'],
     init:'/a/version/a.init.js',
     deps:['d','c']
     },
     'c':{
     html:'/c/c.html'
     css:'/c/c.css',
     js:[],
     init:'',
     deps:[]
     },
     'd@version':{
     html:''
     css:''
     js:['/d/version/d.js'],
     init:'',
     deps:[]
     }
     }
     * */
    //这种解析组件资源的方式貌似比之前的还简单，待优化，todo
    //    fis.util.map(ret.src, function(subpath, file){
//        if(file.isComponents || file.isComponentModules){
//            var fileId=file.id;
//            for(var componentsAliasName in map.componentsAlias){
//                var componentsName=map.componentsAlias[componentsAliasName];
//                var componentsNameReg=new RegExp(componentsName,'g');
//                if(componentsNameReg.test(fileId)){
//                    //说明该文件是这个组件的资源
//                    if(/\.html/.test(fileId)){
//                        map.components[componentsAliasName]['html']=file.id;
//                    }else if(/\.css/.test(fileId)){
//                        map.components[componentsAliasName]['css']=file.id;
//                    }else if(/\.init\.js/.test(fileId)){
//                        map.components[componentsAliasName]['init']=file.id;
//                    }else if(/[^init]\.js$/.test(fileId)){
//                        map.components[componentsAliasName]['js'].push(file.id);
//                    }
//                }
//            }
//        }
//    });
    /*
     * 2-1.循环找到所有组件的json文件，然后根据spm.main的值文件类型，把值存入相应的组件的相应属性里，并且要转换为相对于
     * 根目录的绝对路径(即最开始没有/)。
     * */
    fis.util.map(ret.src, function(subpath, file){
        //添加判断，只有components和spm_modules目录下的文件才需要解析
        if(file.isComponents || file.isSpmModules ){

            if(/package\.json/g.test(subpath)){
                var dir,fileName,version,packageJson,packageJsonMain,componentsAliasName,componentsDir;
                if(/[0-9]*\.[0-9]*\.[0-9]*/g.test(subpath)){
                    //有版本号
                    //默认组件目录名为components、spm_modules，如果有修改，则需修改此处，todo
                    dir=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
                    version=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[1];
                    fileName=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[2].split('.')[0];
                    componentsAliasName=dir+'@'+version;
                    componentsDir=parsePath(subpath).rDir;
                    packageJson=JSON.parse(file._content);
                    packageJsonMain=packageJson.spm.main;

                    if(packageJsonMain){
                        if(/\.js/g.test(packageJsonMain)){
                            //console.log('have main js!:'+componentsDir+packageJsonMain);
                            map.components[componentsAliasName].js.push(componentsDir+packageJsonMain);
                        }else if(/\.css/g.test(packageJsonMain)){
                            //console.log('have main css!:'+componentsDir+packageJsonMain);
                            map.components[componentsAliasName].css=componentsDir+packageJsonMain;
                        }

                    }
                    //map.components[componentsAliasName].packageJson=packageJson;
                }else{
                    //没有版本号
                    dir=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
                    fileName=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[1].split('.')[0];
                    componentsAliasName=dir;
                    componentsDir=parsePath(subpath).rDir;
                    packageJson=JSON.parse(file._content);
                    packageJsonMain=packageJson.spm.main;
                    if(packageJsonMain){
                        if(/\.js/g.test(packageJsonMain)){
                            map.components[componentsAliasName].js.push(componentsDir+packageJsonMain);
                        }else if(/\.css/g.test(packageJsonMain)){
                            map.components[componentsAliasName].css=componentsDir+packageJsonMain;
                        }
                    }
                    //map.components[componentsAliasName].packageJson=packageJson;
                }
            }
        }
    });
    /*
     *2-2.循环所有组件，把index或组件名.html加入到该组件的html属性里，把index.init.js或组件名.init.js加入到init属性里，
     * 如果该组件的css属性为空，说明它的spm.main不是css文件，把index.css或组件名.css加入到css属性里，如果该组件的js为空，
     * 说明它的spm.main不是js文件，把index.js或组件名.js加入到js属性里，最后再去寻找该组件入口js的内部本地依赖，如果有则
     * 加入到组件的js属性里。
     * */
    fis.util.map(ret.src, function(subpath, file){
        //添加判断，只有components和spm_modules目录下的文件才需要解析
        if(file.isComponents || file.isSpmModules ){

            var dir,version,componentsAliasName,htmlReg,cssReg,jsReg,initReg;

            if(/[0-9]*\.[0-9]*\.[0-9]*/g.test(subpath)){
                //有版本号
                //默认组件目录名为components、spm_modules，如果有修改，则需修改此处，todo
                dir=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
                version=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[1];
                componentsAliasName=dir+'@'+version;
            }else{
                //没有版本号
                dir=subpath.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
                componentsAliasName=dir;
            }
            htmlReg=new RegExp('index\.html|'+dir+'\.html','g');
            cssReg=new RegExp('index\.css|'+dir+'\.css','g');
            jsReg=new RegExp('index\.js|'+dir+'\.js','g');
            initReg=new RegExp('index\.init\.js|'+dir+'\.init\.js','g');

            if(htmlReg.test(subpath)&&map.components[componentsAliasName].html==''){
                map.components[componentsAliasName].html=file.id;
            }
            if(cssReg.test(subpath)&&map.components[componentsAliasName].css==''){
                map.components[componentsAliasName].css=file.id;
            }
            if(jsReg.test(subpath)&&map.components[componentsAliasName].js.length==0){
                map.components[componentsAliasName].js.push(file.id);
            }
            if(initReg.test(subpath)&&map.components[componentsAliasName].init==''){
                map.components[componentsAliasName].init=file.id;
            }
            //寻找该组件的内部js依赖，并保存在它的js数组中
            for(var i=0;i<map.components[componentsAliasName].js.length;i++){
                var currComponentJs=map.components[componentsAliasName].js[i];
                map.components[componentsAliasName].js= map.components[componentsAliasName].js.concat(findJsDeps(currComponentJs));
            }
        }
    });


    function getComponentsAliasName(path){
        //'/components/menu/0.0.0/menu.js';yes
        //'/components/menu/menu.js';yes
        //'/components/menu/0.0.0/menu.init.js';no
        //'/components/menu/menu.init.js';no
        /*
         * 通过传入的components、spm_modules目录里的文件路径，返回这两个目录里的所有组件别名
         * 规则：
         * 有版本号,说明是spm_modules里的组件，返回【目录名@version】，目录名即组件名
         * 没有版本号，是本地组件，返回【目录名】
         * */
        var dir,fileName,version;
        if(/[0-9]*\.[0-9]*\.[0-9]*/g.test(path)){
            //有版本号,说明是spm_modules里的组件，返回【目录名@version】，目录名即组件名
            //默认组件目录名为components、spm_modules，如果有修改，则需修改此处，todo
            dir=path.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
            version=path.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[1];
            //fileName=path.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[2].split('.')[0];
            return dir+'@'+version;
        }else{
            //没有版本号，本地组件，返回【目录名】
            dir=path.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[0];
            //fileName=path.replace(/^(\/|)(components|spm_modules)\//g,'').split('\/')[1].split('.')[0];
            return dir;
        }

    }
    /*
     3.建立一个别名表aliasMap对象，目的是给wn识别模块别名用，只需提取componentsAliasMap里有js的组件和其别名即可
     即该文件需在components或者component_modules或者spm_modules目录下的js，
     aliasMap={
     "a": "a/a.js",
     "b@1.0.0": "spm_modules/b/1.0.0/b.js"，
     "component/b@1.0.0": "component_modules/b/1.0.0/b.js"
     }
     */
    for(var componentsAliasName in map.components){
        if(map.components[componentsAliasName].js.length!=0 && !map.alias.hasOwnProperty(componentsAliasName)){
            map.alias[componentsAliasName] = map.components[componentsAliasName].js[0];
        }
    }

    /*
     * 4.建立一个tpl模板模块依赖表templateDepsMap对象，记录每个tpl模板用到的所有不重复模块资源地址包括mainjs里的资源，和初始化调用的记录。
     templateDepsMap={
     'views/a.tpl':{
     deps:['a','b@version'，‘a/aa.js’]
     }
     }
     * */
    fis.util.map(ret.src, function(subpath, file){

        if(file.requireComponents){

            map.templateDeps[file.id]={css:[],js:[],init:[],pkg:{css:{path:''},js:{path:''}}};
            map.templateDeps[file.id].deps=file.requireComponents.distinct();
            for(var i=0;i<map.templateDeps[file.id].deps.length;i++){
                map.templateDeps[file.id].deps=map.templateDeps[file.id].deps.concat(findDeps(map.templateDeps[file.id].deps[i]));
            }
            if(file.mainJs){
                map.templateDeps[file.id].mainJs=file.mainJs;
                //寻找mainjs里的依赖
                for(var i=0;i<ret.src[file.mainJs].requires.length;i++){
                    map.templateDeps[file.id].deps.push(ret.src[file.mainJs].requires[i]);
                    map.templateDeps[file.id].deps=map.templateDeps[file.id].deps.concat(findDeps(ret.src[file.mainJs].requires[i]));
                }
            }
            map.templateDeps[file.id].deps=delUseless(map.templateDeps[file.id].deps);
        }
    });

    /*
     * 5. 建立一个需打包的文件表pkgMap对象，记录每个tpl模板用到的组件的打包文件路径。
     * /
     /*pkg={
     "views/a.tpl": {
     "css": [
     "a/0.0.1/a.css",
     "b/b.css"
     ],
     "js": [
     "a/0.0.1/a.js",
     "b/1.10.2/b.js",
     "c/c.js",
     "d/1.0.0/d.js"
     ],
     "init": [
     "a/0.0.1/a.init.js",
     "b/b.init.js"
     ]
     }
     }
     * */
    for(var templateName in map.templateDeps){
        var deps=map.templateDeps[templateName].deps;
        for(var i=0;i<deps.length;i++){
            var componentAliasName=deps[i];
            if(map.components[componentAliasName].css){
                map.templateDeps[templateName].css=map.templateDeps[templateName].css.concat(map.components[componentAliasName].css);
            }
            if(map.components[componentAliasName].js){
                map.templateDeps[templateName].js=map.templateDeps[templateName].js.concat(map.components[componentAliasName].js);
            }
            if(map.components[componentAliasName].init){
                map.templateDeps[templateName].init=map.templateDeps[templateName].init.concat(map.components[componentAliasName].init);
            }
        }
    }
    //console.log(stringObj(map));
    //console.log(fis.config);
    /*
     * 6.根据pkgMap找到每个模板对应的资源包，然后把所有引用样式写到/static/pkg/模板名_ components.css下，
     * 此处应留一个插件接口，可以对打包的组件css进行一些个性化处理和并校正样式里的相对路径资源引用为绝对路径，相对于tpl结构。
     * 所有模块写到/static/pkg/模板名_ components.js里，替换模板里的__COMPONENTS_CSS__为“/static/pkg/模板名_ components.css”
     * 的样式引用，替换__COMPONENTS_JS__为“/static/pkg/模板名_ components.js”的脚本引用，通过页面里带有data-main的脚本标签去
     * 寻找__COMPONENTS_INIT__标签，然后将其替换为所有模块的初始化代码，寻找__COMPONENTS_ALIAS__标签，然后将其替换为所有模块的别名对象。
     * */
    var domain,root;
    if(opt.domain&&fis.config.get('roadmap').domain){
        domain=fis.config.get('roadmap').domain;
    }
    if(opt.dest=='preview'){
        //root = fis.util.realpath(process.cwd());
        root = fis.project.getTempPath('www');
        //console.log(root);
        //console.log(fis.util.pathinfo(fis.util.realpath(process.cwd())));
    }else{
        root=opt.dest;
    }

    for(var templateName in map.templateDeps){
        var template=map.templateDeps[templateName],
            templateFileObj=ret.src['/'+templateName],
            templateFileName=parsePath(templateName).fileName;


        //设置js和css打包文件路径
        template.pkg.css.path=(domain||'')+fis.config.get('release')+'static/pkg/'+templateFileName+'_components.css';
        template.pkg.js.path=(domain||'')+fis.config.get('release')+'static/pkg/'+templateFileName+'_components.js';

        //写入打包文件到设置地址
        fis.util.write(root+fis.config.get('release')+'static/pkg/'+templateFileName+'_components.css', getFilesContents(template.css,[translateCssRelativePathToAbsolute]));
        fis.util.write(root+fis.config.get('release')+'static/pkg/'+templateFileName+'_components.js', getFilesContents(template.js));


        //替换模板里的组件标签为对应的html结构
        for(var i=0;i<template.deps.length;i++){
            var component=template.deps[i];
            if(templateFileObj.ext=='.html'){
                //如果该文件是tpl文件，则要替换组件名称为组件的html
                templateFileObj._content=templateFileObj._content.replace(componentsReg(component),getFilesContents(map.components[component].html||[]));
            }else if(templateFileObj.rExt=='.css'){
                //如果该文件渲染后缀是css文件，则要替换组件名称为组件的css
                templateFileObj._content=templateFileObj._content.replace(componentsReg(component),getFilesContents(map.components[component].css||[]));
            }

        }
        if(templateFileObj.ext=='.html'){
            //只替换后缀是.tpl文件的__COMPONENTS_CSS__、__COMPONENTS_JS__、__COMPONENTS_INIT__、__COMPONENTS_ALIAS__为各自的引用和代码
            templateFileObj._content=templateFileObj._content.replace(/__COMPONENTS_CSS__/g,'<link rel="stylesheet" type="text/css" href="'+template.pkg.css.path+'"/>');
            templateFileObj._content=templateFileObj._content.replace(/__COMPONENTS_JS__/g,'<script type="text/javascript" src="'+template.pkg.js.path+'"></script>');
            if(template.mainJs){
                if(template.mainJs!='self'){
                    ret.src[template.mainJs]._content=ret.src[template.mainJs]._content.replace(/__COMPONENTS_INIT__/g,getFilesContents(template.init));
                    ret.src[template.mainJs]._content=ret.src[template.mainJs]._content.replace(/__COMPONENTS_ALIAS__/g,stringObj(map.alias));
                }else{
                    templateFileObj._content=ret.src[template.mainJs]._content.replace(/__COMPONENTS_INIT__/g,getFilesContents(template.init));
                    templateFileObj._content=ret.src[template.mainJs]._content.replace(/__COMPONENTS_ALIAS__/g,stringObj(map.alias));
                }
            }else{
                console.log('请设置'+templateFileName+'模板的mainJS，在入口script标签里加入data-main="true"属性即可！');
            }

        }

    }

    function componentsReg(name){
        switch (name){
            case '**':
                name='(.)*';
                break;
        }
        return new RegExp('<!--load\\(("|\')('+name+')("|\')\\)-->','g');
    }
    function delUseless(arr){
        //去掉数组中的非组件名字的元素，并且去掉重复
        var arr=arr.distinct(),
            array=[];

        for(var i=0;i<arr.length;i++){
            var component=arr[i];
            if(map.componentsAlias[component]){
                array.push(component);
            }
        }
        return array;
    }
    function findJsDeps(name){

        var deps=[],realName=name;

        if(map.deps[realName]&&/\.js/.test(map.deps[realName])){
//            for(var j=0;j<map.deps[realName].length;j++){
//                if(map.alias[map.deps[realName][j]]){
//                    deps.push(map.deps[realName][j]);
//                }
//            }
            for(var i=0;i<map.deps[realName].length;i++){
                //只加入依赖里的js
                if(/\.js/.test(map.deps[realName][i])){
                    deps.push(map.deps[realName][i]);
                }
            }
            for(var i=0;i<deps.length;i++){
                var depName=deps[i];
                if(/\.js/.test(depName)){
                    deps=deps.concat(findDeps(depName));
                }else{
                    //console.log('[findJsDeps]: '+depName+' isn\'t js , ignore it!');
                }
            }
        }else{
            return deps;
        }

        return deps;
    }
    function findDeps(name){
        //根据组件标识符去deps表里寻找该组件的所有依赖，返回一个依赖数组
        /*
         *  "deps": {
         "menu/menu.html": [
         "menu/menu.js",
         "menu/menu.css"
         ],
         "menu/menu.init.js": [
         "menu"
         ],
         "menu/menu.js": [
         "jquery@1.10.2",
         "menu/menu.css"
         ],
         "reg/reg.html": [
         "reg/reg.js",
         "reg/reg.css"
         ],
         "reg/reg.init.js": [
         "reg"
         ],
         "reg/reg.js": [
         "jquery@1.10.2",
         "register@1.0.0",
         "reg/reg.css"
         ],
         "menu1/0.0.1/menu1.html": [
         "menu1/0.0.1/menu1.js",
         "menu1/0.0.1/menu1.css"
         ],
         "menu1/0.0.1/menu1.init.js": [
         "menu1"
         ],
         "menu1/0.0.1/menu1.js": [
         "jquery@1.10.2",
         "menu1/0.0.1/menu1.css"
         ],
         "menu1/0.0.2/menu1.html": [
         "menu1/0.0.2/menu1.js",
         "menu1/0.0.2/menu1.css"
         ],
         "menu1/0.0.2/menu1.init.js": [
         "menu1"
         ],
         "menu1/0.0.2/menu1.js": [
         "jquery@1.10.2",
         "menu1/0.0.2/menu1.css"
         ],
         "menu2/0.0.1/menu2.html": [
         "menu2/0.0.1/menu2.css"
         ],
         "register/1.0.0/register.js": [
         "jquery@1.10.2"
         ]
         },
         name可能传入一个component别名，可能传入是一个css，可能是一个js路径
         * */
        var deps=[],realName;

        if(map.alias[name]){
            realName=map.alias[name];
        }else{
            realName=name;
        }

        if(map.deps[realName]){
//            for(var j=0;j<map.deps[realName].length;j++){
//                if(map.alias[map.deps[realName][j]]){
//                    deps.push(map.deps[realName][j]);
//                }
//            }
            deps=deps.concat(map.deps[realName]);
            for(var i=0;i<deps.length;i++){
                var depName=deps[i];
                if(map.alias[depName]){
                    deps=deps.concat(findDeps(map.alias[depName]));
                }else if(/\.js/.test(depName)){
                    deps=deps.concat(findDeps(depName));
                }else{
                    //console.log('[findDeps]: '+depName+' isn\'t js , ignore it!');
                }
            }
        }else{
            return deps;
        }

        return deps;
    }
    function wrapStrHtmlLabel(str,type){
        //根据type给str加上html调用标签，返回加完标签后的str
        if(type=='css'){
            return '<style type="text/css">\r\n'+str+'\r\n</style>';
        }else if(type=='js'){
            return '<script type="text/javascript">\r\n'+str+'\r\n</script>';
        }
        return false;
    }
    function getTypeRequire(requireArray,type){
        //根据type取出依赖路径数组的该类型的uri，并返回该类型uri数组
        var typeRequireUris=[],
            typeReg=new RegExp(type,'g');
        for(var i=0;i<requireArray.length;i++){
            var requireUri=requireArray[i];
            if(typeReg.test(requireUri)){
                typeRequireUris.push(requireUri);
            }
        }
        return typeRequireUris;
    }
    function getFilesContents(uriArray,compileArray){
        //返回该路径数组的所有内容字符串

        if(typeof uriArray == 'string'){
            uriArray=[uriArray];
        }

        var str='',
            compiledStr='';
        for(var i=0;i<uriArray.length;i++){
            var uri=uriArray[i];
            if(ret.ids[uri]){
                if(compileArray){
                    if(typeof compileArray == 'function'){
                        compileArray=[compileArray];
                    }
                    for(var j=0;j<compileArray.length;j++){
                        var compile=compileArray[j];
                        compiledStr=compile(ret.ids[uri]._content,uri);
                    }
                    str+=compiledStr+'\r\n';
                }else{
                    str+=ret.ids[uri]._content+'\r\n';
                }

            }else if(!ret.ids[uri]&&ret.src['/'+uri]){
                var uri='/'+uri;
                if(compileArray){
                    if(typeof compileArray == 'function'){
                        compileArray=[compileArray];
                    }
                    for(var j=0;j<compileArray.length;j++){
                        var compile=compileArray[j];
                        compiledStr=compile(ret.src[uri]._content,uri);
                    }
                    str+=compiledStr+'\r\n';
                }else{
                    str+=ret.src[uri]._content+'\r\n';
                }
            }else{
                console.log('can\'t find :'+uri+' object in ret.src!');
            }

        }

        return str;
    }
    function translateCssRelativePathToAbsolute(content,uri){
        //var absolutePath=uri.replace(//g,'');
        var uriObj=parsePath(uri);
        //console.log('content:'+content);
        return content.replace(/\.\//g,fis.config.get('release')+'c'+uriObj.dir);
    }
    function parsePath(path){
        var path=normalizePath(path),
            pathArr=path.split('/'),
            pathObj={rDir:'',dir:'',fileName:'',extName:''};//rDir,为相对路径，即开始没有/

        for(var i= 0,L=pathArr.length;i<L;i++){
            if(i<L-1){
                pathObj.dir+=pathArr[i]+'/';
            }else{
                pathObj.fileName=pathArr[i].split('.')[0];
                pathObj.extName=pathArr[i].split('.')[1];
            }
        }
        pathObj.rDir=pathObj.dir.replace(/^\//g,'');
        function normalizePath(path){
            return path.replace(/\\/g,'/');
        }
        return pathObj;
    }

    //获取依赖数组，根据文件类型分成css和js，然后根据引用模板名进行分别打包，把css包插入到__COMPONENT_CSS__，把js包插入到__COMPONENT_JS__

//    var retStr = stringObj(ret);
//    var confStr = stringObj(conf);
//    var settingsStr = stringObj(settings);

//    fis.util.write(fis.project.getProjectPath()+'/test/retStr.txt', retStr);
//    fis.util.write(fis.project.getProjectPath()+'/test/confStr.txt', confStr);
//    fis.util.write(fis.project.getProjectPath()+'/test/settingsStr.txt', settingsStr);
//    fs.writeFile('D:/senro/senro/git/company/wn-site/test/optStr.txt', optStr, function (err) {
//        console.log('optStr导出成功！');
//    });
};
//在modules.postpackager阶段处理依赖树，调用插件函数
fis.config.set('modules.postpackager', [bulidWn]);