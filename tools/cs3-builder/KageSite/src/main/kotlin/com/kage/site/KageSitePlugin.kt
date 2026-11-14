package com.kage.site

import com.lagradost.cloudstream3.plugins.CloudstreamPlugin
import com.lagradost.cloudstream3.plugins.Plugin

@CloudstreamPlugin
class KageSitePlugin : Plugin() {
    override fun load() {
        registerMainAPI(KageSite())
    }
}
