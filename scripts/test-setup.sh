#!/bin/bash
set -e

curl -L "https://github.com/kcjerrell/dtm/releases/download/test-data-v3/test_data_v3.zip" -o test_data.zip
unzip -o test_data.zip -d .
rm test_data.zip
mkdir -p test_data/temp