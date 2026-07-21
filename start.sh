#!/bin/bash

params=()
while [ $# -gt 0 ]; do
  case "$1" in
    --schema|--data|--ref|--remoteRef|--port|--baseUrl|--pidPath|--logDir)
      if [ $# -lt 2 ]; then
        printf "Missing value for %s\n" "$1" >&2
        exit 1
      fi
      params+=("$1" "$2")
      shift
      ;;
    *)
      printf "*********************************************************************************\n"
      printf "* Error, invalid arguments. Valid arguments are \n"
      printf "* --schema /path/to/schema --data /path/to/data  \n"
      printf "* --ref /path/to/ref/dir --remoteRef https://... --port server port  \n"
      printf "*********************************************************************************\n"
      exit 1
  esac
  shift
done

exec node src/biovalidator "${params[@]}"
