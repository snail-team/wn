module.exports = function(){
    var content = [
         'v' + fis.cli.info.version,
         ' **       **'.red.bold+'    ****     **'.green.bold,
         '/**      /**'.red.bold+'   /**/**   /**'.green.bold,
         '/**   *  /**'.red.bold+'   /**//**  /**'.green.bold,
         '/**  *** /**'.red.bold+'   /** //** /**'.green.bold,
         '/** **/**/**'.red.bold+'   /**  //**/**'.green.bold,
         '/**** //****'.red.bold+'   /**   //****'.green.bold,
         '/**/   ///**'.red.bold+'   /**    //***'.green.bold,
         '//       // '.red.bold+'   //      /// '.green.bold
    ].join('\n');
    console.log(content);
};