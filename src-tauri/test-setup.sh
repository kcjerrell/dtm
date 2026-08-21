#!/bin/bash
set -e

curl -L "https://github.com/kcjerrell/dtm/releases/download/test-data-v2/test-data-v2.zip" -o test-data.zip
unzip -o test-data.zip -d .
rm test-data.zip
mkdir -p test_data/temp