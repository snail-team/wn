# fis-parser-markdown

A parser plugin for fis to compile markdown file.

## usage

    $ npm install -g fis-parser-markdown
    $ vi path/to/project/fis-conf.js

```javascript
//use the `fis-parser-marked` plugin to parse *.md file
fis.config.set('modules.parser.md', 'marked');
//*.md will be released as *.html
fis.config.set('roadmap.ext.md', 'html');