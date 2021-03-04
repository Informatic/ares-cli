#!/usr/bin/env node

/*
 * Copyright (c) 2020 LG Electronics Inc.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs'),
    path = require('path'),
    async = require('async'),
    log = require('npmlog'),
    nopt = require('nopt'),
    installLib = require('./../lib/install'),
    commonTools = require('./../lib/base/common-tools');

const processName = path.basename(process.argv[1]).replace(/.js/, '');

const version = commonTools.version,
    cliControl = commonTools.cliControl,
    help = commonTools.help,
    setupDevice = commonTools.setupDevice,
    appdata = commonTools.appdata,
    errHndl = commonTools.errMsg;

process.on('uncaughtException', function (err) {
    log.error('uncaughtException', err.toString());
    log.verbose('uncaughtException', err.stack);
    cliControl.end(-1);
});

if (process.argv.length === 2) {
    process.argv.splice(2, 0, '--help');
}

const knownOpts = {
    "device":   [String, null],
    "device-list":  Boolean,
    "list":     Boolean,
    "listfull": Boolean,
    "type":     [String, null],
    "install":  path,
    "remove":   String,
    "opkg": Boolean,
    "opkg-param":   [String, null],
    "version":  Boolean,
    "help":     Boolean,
    "hidden-help":      Boolean,
    "level":    ['silly', 'verbose', 'info', 'http', 'warn', 'error']
};

const shortHands = {
    "d": ["--device"],
    "i": ["--install"],
    "r": ["--remove"],
    "o": ["--opkg"],
    "op": ["--opkg-param"],
    "l": ["--list"],
    "F": ["--listfull"],
    "t": ["--type"],
    "D": ["--device-list"],
    "V": ["--version"],
    "h": ["--help"],
    "hh": ["--hidden-help"],
    "v": ["--level", "verbose"]
};
const argv = nopt(knownOpts, shortHands, process.argv, 2 /* drop 'node' & 'ares-install.js'*/);

log.heading = processName;
log.level = argv.level || 'warn';
installLib.log.level = log.level;
log.verbose("argv", argv);

/**
 * For consistent of "$command -v", argv is used.
 * By nopt, argv is parsed and set key-value in argv object.
 * If -v or --level option is input with command, it is set key-value in argv.
 * After it is deleted, If remained key is only one in argv object
 * (If any other are remained, it's mean another options is input)
 * and there is no remaining after parsing the input command by nopt
 * (If any other are remained, it's mean another parameters ares input),
 * each command of webOS CLI print help message with log message.
 */
if (argv.level) {
    delete argv.level;
    if (argv.argv.remain.length === 0 && (Object.keys(argv)).length === 1) {
        argv.help=true;
    }
}

const options = {
        appId: 'com.ares.defaultName',
        device: argv.device,
        opkg: argv.opkg || false,
        opkg_param:  argv['opkg-param'],
    };

let op;
if (argv.help || argv['hidden-help']) {
    showUsage(argv['hidden-help']);
    cliControl.end();
} else if (argv.list) {
    op = list;
} else if (argv.listfull) {
    op = listFull;
} else if (argv.install) {
    op = install;
} else if (argv.remove) {
    op = remove;
} else if (argv['device-list']) {
    setupDevice.showDeviceListAndExit();
} else if (argv.version) {
    version.showVersionAndExit();
} else {
    op = install;
}

if (op) {
    version.checkNodeVersion(function() {
        async.series([
            op.bind(this)
        ],finish);
    });
}

function showUsage(hiddenFlag) {
    if (hiddenFlag) {
        help.display(processName, appdata.getConfig(true).profile, hiddenFlag);
    } else {
        help.display(processName, appdata.getConfig(true).profile);
    }
}

function install() {
    const pkgPath = argv.install || argv.argv.remain[0];
    log.info("install():", "pkgPath:", pkgPath);
    if (!pkgPath) {
        return finish(errHndl.changeErrMsg("EMPTY_VALUE", "PACKAGE_FILE"));
    } else {
        if (!fs.existsSync(path.normalize(pkgPath))) {
            return finish(errHndl.changeErrMsg("NOT_EXIST_PATH", pkgPath));
        }
        installLib.install(options, pkgPath, finish);
    }
}

function list(){
    installLib.list(options, function(err, pkgs) {
        let strPkgs = "";
        let cnt = 0;
        if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
            if (argv.type) {
                if (argv.type !== pkg.type) {
                    return;
                }
            }
            if (cnt++ !== 0) strPkgs = strPkgs.concat('\n');
            strPkgs = strPkgs.concat(pkg.id);
        });
        console.log(strPkgs);
        return finish(err);
    });
}

function listFull() {
    installLib.list(options, function(err, pkgs) {
        let strPkgs = "";
        if (pkgs instanceof Array) pkgs.forEach(function (pkg) {
            if (argv.type) {
                if (argv.type !== pkg.type) {
                    return;
                }
            }
            strPkgs = strPkgs.concat('----------------\n');
            strPkgs = strPkgs.concat("id:"+ pkg.id+", ");
            for (const key in pkg) {
                if (key === "id") continue;
                strPkgs = strPkgs.concat(key+":").concat(pkg[key]).concat(", ");
            }
            strPkgs = strPkgs.concat('\n');
        });
        process.stdout.write(strPkgs);
        finish(err);
    });
}

function remove() {
    const pkgId = (argv.remove === 'true')? argv.argv.remain[0] : argv.remove;
    log.info("remove():", "pkgId:", pkgId);
    if (!pkgId) {
        return errHndl.finish(errHndl.changeErrMsg("EMPTY_VALUE", "APP_ID"));
    }
    installLib.remove(options, pkgId, finish);
}

function finish(err, value) {
    if (err) {
        if (err.length === undefined) { // single error
            log.error(err.heading, err.message);
            log.verbose(err.stack);
        } else if (err.length > 0){ // [service/system] + [tips] error
            for(const index in err){
                log.error(err[index].heading, err[index].message);
            }
            log.verbose(err[0].stack);
        }
        cliControl.end(-1);
    } else {
        log.info('finish!!!!():', value);
        if (value && value.msg) {
            console.log(value.msg);
        }
        cliControl.end();
    }
}
