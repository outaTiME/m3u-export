
/*
 *  Copyright 2013 outaTiME.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var
  events = require("events"),
  util = require("util"),
  fs = require("fs"),
  path = require("path"),
  lineReader = require("line-by-line"),
  mkdirp = require("mkdirp"),
  ncp = require('ncp').ncp,
  ffmpeg = require('ffmpeg-node');

ncp.clobber = false;

function Exporter() {
  events.EventEmitter.call(this);
}

util.inherits(Exporter, events.EventEmitter);

Exporter.prototype["export"] = function (input, output) {
  var self = this, copied = 0, preserved = 0, dir = path.resolve(path.dirname(input)),
    filename = path.basename(input, path.extname(input));

  if (input) {
    fs.lstat(input, function (err, stat) {
      if (err) {
        self.emit("error", new Error("Error while trying to resolve the input file."));
        return;
      }
      if (stat.isFile() && /\.m3u$/i.test(input)) {

        // create directory
        output = output || filename;
        // TODO: check directory existence
        mkdirp.sync(output);

        // read m3u
        var lr = new lineReader(input);

        lr.on('error', function (err) {
          self.emit("error", err);
        });

        lr.on('line', function (file) {
          if (!/^#/i.test(file)) {
            var dest_extension = path.extname(file), dest_filename = path.basename(file, dest_extension),
              target = path.join(output, dest_filename + dest_extension);
            lr.pause();
            if (/\.m4a$/i.test(dest_extension)) {
              dest_extension = ".mp3"; // force mp3 extension
              target = path.join(output, dest_filename + dest_extension);
              if (!fs.existsSync(target)) {
                // convert (with force '-y' flag to execute callback)
                var params = [
                  '-i', file,
                  '-acodec', 'libmp3lame',
                  '-aq', '1',
                  '-y', target
                ];
                ffmpeg.exec(params, function (stderr, stdout, code) {
                  copied++;
                  self.emit("converted", dest_filename);
                  lr.resume();
                });
              } else {
                preserved ++;
                self.emit("preserved", dest_filename);
                lr.resume();
              }
            } else { // default
              if (!fs.existsSync(target)) {
                ncp(file, path.join(output, dest_filename + dest_extension), function (err) {
                  if (!err) {
                    copied++;
                    self.emit("copied", dest_filename);
                  }
                  lr.resume();
                });
              } else {
                preserved ++;
                self.emit("preserved", dest_filename);
                lr.resume();
              }
            }
          }
        });

        lr.on('end', function () {
          self.emit("done", copied, preserved);
        });

      } else if (stat.isDirectory()) {
        self.emit("error", new Error("No valid input file specified, folder found."));
      }
    });
  } else {
    self.emit("error", new Error("Input file must be specified."));
  }
};

// export
module.exports = new Exporter();
