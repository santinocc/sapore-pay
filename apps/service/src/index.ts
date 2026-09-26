import 'dotenv/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
createApp(config).listen(config.PORT, () => {
  console.log(`sapore-pay service listening on :${config.PORT}`)
})
