#!/usr/bin/env node
const fs = require('fs-extra')
const path = require('path')

const COOKIEFILE = path.join(__dirname, 'cookie.json')

fs.remove(COOKIEFILE).then(() => console.log('Your GitHub login credentials(cookies) have been deleted.'))
