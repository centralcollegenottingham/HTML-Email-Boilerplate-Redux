// Dependencies that makes this all work! Yay packages!
var cleanCSS = require('gulp-clean-css'),
    del = require('del'),
    dotenv_extended = require('dotenv-extended'),
    fs = require('fs'),
    git_rev = require('git-rev'),
    gulp = require('gulp'),
    inlineCSS = require('gulp-inline-css'),
    preprocess = require('gulp-preprocess'),
    rename = require('gulp-rename');

// Load in environment variables from .boilerplate.defaults first and then .boilerplate.custom if it exists
var boilerplateCustomFile = '.boilerplate.custom';
var boilerplateConfig = dotenv_extended.load(
    {
        encoding: 'utf8',
        silent: true,
        path: boilerplateCustomFile,
        defaults: '.boilerplate.defaults',
        errorOnMissing: false,
        errorOnExtra: false,
        assignToProcessEnv: true,
        overrideProcessEnv: true
    }
);

// We need to check if DOCTYPE_VERSION is using an XHTML value for inline-css purposes later
var doctypeValue = process.env.DOCTYPE_VERSION;
if (/xhtml/i.test(doctypeValue)) {
    isXHTMLDoctype = true;
}
else {
    isXHTMLDoctype = false;
}

// Check if preheader needs to be padded with &nbsp;
var preheaderPaddingInt = process.env.PREHEADER_CHARACTER_PADDING;
var nbsp = ''; // global so for loop output can be assigned to env var
if (preheaderPaddingInt > 0) {
    for (i = 0; i < preheaderPaddingInt; i++) {
        nbsp += '&nbsp;';
    }
    process.env.PREHEADER_CHARACTER_PADDING_NBSP = nbsp;
}
else {
    // Avoid undefined value or invalid value and initalise as blank
    process.env.PREHEADER_CHARACTER_PADDING_NBSP = ''
}

// Clean out /tmp and /dist directories each time gulp is run
gulp.task('clean', function () {
    return del(['tmp/*', 'dist/*']);
});

// Get Git revision details for use in boilerplate templates
gulp.task('git-rev-info', ['clean'], function() {
    // Get latest commit (short)
    git_rev.short(
        function(rev_short) {
            return process.env.GIT_REVISION_SHORT = rev_short;
        }
    )
    // Get latest commit (long)
    git_rev.long(
        function(rev_long) {
            return process.env.GIT_REVISION_LONG = rev_long;
        }
    )
    // Get branch name boilerplate is being generated from
    git_rev.branch(
        function(branch) {
            return process.env.GIT_BRANCH = branch;
        }
    )
});

// Build all HTML samples, inline CSS and strip comments to be included in boilerplate
gulp.task('build-html-samples', ['clean'], function() {
    var stream = gulp.src('./app/html-samples/*.html')
    .pipe(preprocess())
    .pipe(inlineCSS(
        {
            applyStyleTags: true,
            removeStyleTags: true,
            removeHtmlSelectors: true,
            applyTableAttributes: true,
            xmlMode: isXHTMLDoctype
        }
    ))
    .pipe(gulp.dest('./tmp/html-samples/'));
    return stream;
});

// Preprocess CSS files with config values
gulp.task('preprocess-css', ['build-html-samples'], function() {
    var stream = gulp.src('./app/css/*.css')
    .pipe(preprocess())
    .pipe(gulp.dest('./tmp/css/'))
    return stream;
});

var cleanCSSFormat = 'keep-breaks';

// Minify processed CSS for inclusion in the email boilerplate
gulp.task('minify-css', ['preprocess-css'], function() {
    var stream = gulp.src('./tmp/css/*.css')
    .pipe(cleanCSS(
        {
            compatibility: {
                properties: {
                    colors: false,
                    zeroUnits: false
                }
            },

            format: cleanCSSFormat,

            level: {
                1: {
                    all: false,
                    specialComments: 'all'
                },
                2: {
                    all: false,
                    mergeIntoShorthands: false
                }
            }
        },
        // Show minify results
        function(details) {
            var originalCSSSize = details.stats.originalSize;
            var minifiedCSSSize = details.stats.minifiedSize;
            var cssFileDiff = originalCSSSize - minifiedCSSSize;
            console.log('Minified ' + details.name + ' saved ' + cssFileDiff + ' bytes');
        })
    )
    .pipe(rename({ extname: '.css.min' }))
    .pipe(gulp.dest('./tmp/css/'));
    return stream;
});

// Remove CSS comments from minified files for production version of the boilerplate
gulp.task('remove-css-comments', ['minify-css'], function() {
    var stream = gulp.src('./tmp/css/*.css.min')
    .pipe(cleanCSS(
        {
            compatibility: {
                properties: {
                    colors: false,
                    zeroUnits: false
                }
            },

            format: cleanCSSFormat,

            level: {
                1: {
                    all: false,
                    specialComments: 0
                },
                2: {
                    all: false,
                    mergeIntoShorthands: false
                }
            }
        }
    ))
    .pipe(rename(
        function(path) {
            path.extname = "" // Drop extension to avoid double .css naming
        }
    ))
    // Specific versions with no CSS comments for the production version
    .pipe(rename({ extname: '-nocomments.css.min'}))
    .pipe(gulp.dest('./tmp/css/'));
    return stream;
});

// Build boilerplate and output the HTML versions
gulp.task('preprocess-boilerplate', ['remove-css-comments'], function() {
    var stream = gulp.src('app/email-boilerplate*')
    .pipe(preprocess({ extension: 'html' }))
    .pipe(rename(
        function(path) {
            path.extname = "" // Drop preprocess ext and change to .html
        }
    ))
    .pipe(gulp.dest('./dist/boilerplate/'))
    return stream;
});

// Inline CSS to main layout elements after boilerplate is generated and update documents
gulp.task('inline-css', ['preprocess-boilerplate'], function() {
    var stream = gulp.src('./dist/boilerplate/*.html')
    .pipe(inlineCSS(
        {
            applyTableAttributes: true,
            applyWidthAttributes: true,
            applyStyleTags: false,
            applyLinkTags: true,
            removeStyleTags: false,
            removeLinkTags: true,
            xmlMode: isXHTMLDoctype
        }
    ))
    .pipe(gulp.dest('./dist/boilerplate/'));
    return stream;
});

// Detect certain configurations and warn in console when they are not optimal from recommended guidelines
gulp.task('check-config', ['inline-css'], function() {

    // Valid options for DOCTYPE_VERSION to check for
    var doctypeValidOptions = [
        'xhtml1.0-transitional',
        'xhtml1.0-strict',
        'xhtml1.1',
        'html4-transitional',
        'html4-strict',
        'html5'
    ];

    var isMsoNamespacesEnabled = process.env.ENABLE_VML_NAMESPACES;
    var isXuaCompatMetaTagEnabled = process.env.ENABLE_XUA_COMPATIBLE_META_TAG;
    var xuaCompatValue = process.env.XUA_COMPATIBLE_VALUE;
    var isViewportMetaTagEnabled = process.env.ENABLE_VIEWPORT_META_TAG;
    var viewportValue = process.env.VIEWPORT_META_VALUE;
    var isFormatDetectionEnabled = process.env.ENABLE_FORMAT_DETECTION_META_TAG;
    var formatDetectionValue = process.env.FORMAT_DETECTION_META_VALUE;
    var isYahooShortcutsCSSEnabled = process.env.ENABLE_YAHOO_SHORTCUTS_CSS;
    var isMsoDpiScalingFixEnabled = process.env.ENABLE_MSO_DPI_SCALING_FIX;
    var isWebkitMediaQueryEnabled = process.env.ENABLE_WEBKIT_DETECTION_QUERY;
    var isGeckoMediaQueryEnabled = process.env.ENABLE_GECKO_MEDIA_QUERY;
    var isIEMediaQueryEnabled = process.env.ENABLE_IE_10_11_MEDIA_QUERY;
    var isPreheaderEnabled = process.env.ENABLE_HIDDEN_PREHEADER;
    var preheaderTextValue = process.env.PREHEADER_TEXT;
    var isGmailAndroidFixEnabled = process.env.ENABLE_GMAIL_ANDROID_RESIZE_FIX;
    var isGmailiOSFontFixEnabled = process.env.ENABLE_GMAIL_IOS_FONT_FIX;
    var isTableContainerFixedWidth = process.env.TABLE_CONTAINER_FIXED_WIDTH;
    var preheaderCharacterPaddingInt = process.env.PREHEADER_CHARACTER_PADDING;
    var tableContainerWidthInt = process.env.TABLE_CONTAINER_WIDTH;

    // Small function to re-use for warnings, because lazy
    function configWarn(configMessage) {
        console.warn('CONFIG WARNING:', configMessage)
    }

    // Check for value integer value on required configuration variables
    function isValidInteger(configName, configValue) {
        if(isNaN(configValue)) {
            configWarn(configName + ' is not set to a valid integer value');
        }
    }

    // While they act as booleans, they aren't actually REAL booleans (quacks like a duck etc..)

    if(doctypeValidOptions.indexOf(doctypeValue) < 0) {
        configWarn('No doctype has been set or the current DOCTYPE_VERSION value set isn\'t a valid option. Valid options are: ' + doctypeValidOptions.join(", "));
    }

    if((isMsoNamespacesEnabled === 'false') && (isMsoDpiScalingFixEnabled === 'true')) {
        configWarn('ENABLE_VML_NAMESPACES should be set to true when ENABLE_MSO_DPI_SCALING_FIX is set to true');
    }

    if(isXuaCompatMetaTagEnabled === 'false') {
        configWarn('You should strongly consider setting ENABLE_XUA_COMPATIBLE_META_TAG to true for better Windows Phone/IE compatibility');
    }

    if((isXuaCompatMetaTagEnabled === 'true') && (!/IE=edge/i.test(xuaCompatValue))) {
        configWarn('Using any other value than IE=edge for XUA_COMPATIBLE_VALUE is not recommended');
    }

    if(isViewportMetaTagEnabled === 'false') {
        configWarn('You should strongly consider setting ENABLE_VIEWPORT_META_TAG to true for correct scaling on mobile devices');
    }

    if((isViewportMetaTagEnabled === 'true') && (/user-scalable=no/i.test(viewportValue))) {
        configWarn('You should not disable pinch zooming/resizing gestures, it is bad UX');
    }

    if((isFormatDetectionEnabled === 'true') && (/no/i.test(formatDetectionValue))) {
        configWarn('Disabling auto formatting data also disables any user interaction events i.e. tap to call');
    }

    if(isMsoDpiScalingFixEnabled === 'false') {
        configWarn('You should strongly consider setting ENABLE_MSO_DPI_SCALING_FIX to true for fixing image scaling with DPI values higher than 96');
    }

    if(isYahooShortcutsCSSEnabled === 'true') {
        configWarn('Yahoo Shortcuts is no longer a feature of the Yahoo! Mail webmail client and does not need additional CSS to override');
    }

    if(isWebkitMediaQueryEnabled === 'true') {
        configWarn('The Webkit vendor prefixes return true on some non-webkit clients, do not rely on it for absolute accuracy');
    }

    if(isGeckoMediaQueryEnabled === 'true') {
        configWarn('The Gecko/Mozilla media query is often mangled in Yahoo! Mail and can cause unexpected CSS issues');
    }

    if(isIEMediaQueryEnabled === 'true') {
        configWarn('The IE 10/11 media query will also return true on IEMobile (Windows Phone 8.0/8.1)');
    }

    if(isPreheaderEnabled === 'true') {
        switch(true) {
            case (preheaderTextValue.length < 35):
                configWarn('PREHEADER_TEXT is less than 35 characters, consider increasing the amount of characters to avoid unwanted HTML text being shown in previews');
                break;

            case (preheaderTextValue.length >= 35 && preheaderTextValue.length <= 75):
                configWarn('PREHEADER_TEXT is less than 75 characters, increase the amount of characters for a more effective preheader');
                break;

            case (preheaderTextValue.length > 100):
                configWarn('PREHEADER_TEXT is greater than 100 characters, consider decreasing the amount of characters to avoid truncation in most email clients');
                break;

            case (preheaderTextValue.length > 140):
                configWarn('PREHEADER_TEXT is greater than 140 characters, most email clients will not show all of your preheader');
                break;
        }
    }

    if((isGmailAndroidFixEnabled === 'true') && (isTableContainerFixedWidth === 'false')) {
        configWarn('You should set ENABLE_GMAIL_ANDROID_RESIZE_FIX to false when not using a fixed width container table');
    }

    if((isGmailiOSFontFixEnabled === 'true') && (isTableContainerFixedWidth === 'false')) {
        configWarn('You should set ENABLE_GMAIL_IOS_FONT_FIX to false when not using a fixed width container table');
    }

    if((isGmailiOSFontFixEnabled === 'true') || (isGmailAndroidFixEnabled === 'true')) {
        configWarn('Gmail app font/image spacer hacks for iOS and Android should be deprecated due to CSS3 support, see USAGE.md for more info');
    }

    // Check configuration variables that should be integers
    isValidInteger('PREHEADER_CHARACTER_PADDING', preheaderCharacterPaddingInt);
    isValidInteger('TABLE_CONTAINER_WIDTH', tableContainerWidthInt);

    // Check for older .env file
    if (fs.existsSync('.env')) {
        configWarn('.env is deprecated, please rename your custom settings file to ' + boilerplateCustomFile);
    }

    // Warn if .boilerplate.custom is not found
    if (!fs.existsSync(boilerplateCustomFile)) {
        configWarn(boilerplateCustomFile + ' could not be found. Boilerplate has been configured with default settings');
    }

});

// The order is important! The CSS preprocess stuff must happen first otherwise minify will break everything!
gulp.task('default',
    [
        'clean',
        'git-rev-info',
        'build-html-samples',
        'preprocess-css',
        'minify-css',
        'remove-css-comments',
        'preprocess-boilerplate',
        'inline-css',
        'check-config'
    ]
);
