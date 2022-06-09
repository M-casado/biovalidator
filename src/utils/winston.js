const { format } = require("winston");
const winston = require("winston");
const { printf, combine, timestamp } = format;
require("winston-daily-rotate-file");

this.logPath = "./";

function configureLogPath(logPath) {
  this.logPath = logPath; // Not working, already initialized when calling this.
}

// define the custom settings for each transport (console, file)
const options = {
  console: {
    level: "debug",
    json: false,
    colorize: true
  },
  rotate: {
    level: "info",
    filename: "json-schema-validator-%DATE%.log",
    datePattern: "YYYYMMDD",
    zippedArchive: true, // gzip archived log files
    dirname: this.logPath, // target directory for log files
    maxSize: "20m", // maximum size of the file after which it will rotate
    maxFiles: "14d" // number of days log files will be kept for
  }
};

const dateFormat = printf((info) => {
  return `${info.timestamp} [${info.level}] ${info.message}`;
});

const transportsArray = [ new winston.transports.Console(options.console)];

if(this.logPath) {
  transportsArray.push(new winston.transports.DailyRotateFile(options.rotate));
}

const logger = winston.createLogger({
  format: combine(
    timestamp(),
    dateFormat
  ),
  transports: transportsArray,
  exitOnError: false,
});

module.exports = {logger, configureLogPath};
