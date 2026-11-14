package com.kage.site

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.loadExtractor
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder

/**
 * A CloudStream source whose behaviour comes entirely from a recipe (Recipe.kt), the one the Kage app
 * learned from the site by example. The same steps the app uses, now as a standalone .cs3 the user owns.
 */
class KageSite : MainAPI() {
    override var name = Recipe.name
    override var mainUrl = Recipe.mainUrl
    override var lang = "ar"
    override val hasMainPage = false
    override val supportedTypes = setOf(TvType.Anime, TvType.TvSeries, TvType.Movie)

    private fun host(url: String) = runCatching { URI(url).host?.removePrefix("www.") }.getOrNull()
    private val home get() = host(mainUrl)
    private fun same(url: String) = host(url) == home
    private fun path(url: String) = runCatching { URLDecoder.decode(URI(url).rawPath.orEmpty() + (URI(url).rawQuery?.let { "?$it" } ?: ""), "UTF-8") }.getOrDefault(url)

    private fun results(doc: Document): List<SearchResponse> {
        val skip = Regex("""/(page|tag|category|genre|author|wp-|feed|login|register|search)(/|\b)|#|\?s=""")
        return doc.select("a[href]:has(img)").mapNotNull { a ->
            val href = a.absUrl("href").ifBlank { return@mapNotNull null }
            if (!same(href) || skip.containsMatchIn(href) || href.trimEnd('/') == mainUrl.trimEnd('/')) return@mapNotNull null
            val img = a.selectFirst("img")
            val title = listOf(a.attr("title"), img?.attr("alt").orEmpty(), a.text(), a.parent()?.selectFirst("h2,h3,.title")?.text().orEmpty())
                .map { it.trim() }.firstOrNull { it.length in 2..150 } ?: return@mapNotNull null
            val poster = img?.let { i -> listOf("data-src", "data-lazy-src", "data-original", "src").map { i.absUrl(it) }.firstOrNull { it.isNotBlank() && !it.startsWith("data:") } }
            newTvSeriesSearchResponse(title, href, TvType.Anime) { posterUrl = poster }
        }.distinctBy { it.url.trimEnd('/') }
    }

    override suspend fun search(query: String): List<SearchResponse> {
        val q = URLEncoder.encode(query, "UTF-8")
        val url = Recipe.searchTemplate?.replace("{q}", q) ?: (mainUrl + Recipe.searchPath + q)
        return results(app.get(url).document)
    }

    private fun episodes(doc: Document, page: String): List<Episode> {
        val pattern = Regex("""(?i)(episode|الحلقة|حلقة|ep[-_ ]?\d)""")
        val learned = Recipe.episodeHref?.let { Regex(it) }
        val scope = Recipe.episodeBox?.let { sel -> doc.select(sel).ifEmpty { null } }
        val links = if (learned != null) (scope?.select("a[href]") ?: doc.select("a[href]")).filter { a ->
            val href = a.absUrl("href"); href.trimEnd('/') != page.trimEnd('/') && learned.containsMatchIn(path(href))
        }.distinctBy { it.absUrl("href").trimEnd('/') } else doc.select("a[href]").filter { a ->
            val href = a.absUrl("href")
            same(href) && href.trimEnd('/') != page.trimEnd('/') && (pattern.containsMatchIn(a.text()) || pattern.containsMatchIn(path(href)))
        }.distinctBy { it.absUrl("href").trimEnd('/') }
        fun number(a: Element) = Regex("""\d+""").findAll(a.text().ifBlank { a.absUrl("href") }).lastOrNull()?.value?.toIntOrNull()
        return links.map { a -> newEpisode(a.absUrl("href")) { this.name = a.text().trim().ifBlank { null }; episode = number(a) } }
            .sortedBy { it.episode ?: Int.MAX_VALUE }
    }

    override suspend fun load(url: String): LoadResponse {
        val doc = app.get(url).document
        val title = doc.selectFirst("meta[property=og:title]")?.attr("content")?.substringBefore(" - ")?.substringBefore(" | ")?.trim()
            ?: doc.selectFirst("h1")?.text()?.trim() ?: name
        val poster = doc.selectFirst("meta[property=og:image]")?.attr("content")
        val plot = doc.selectFirst("meta[property=og:description]")?.attr("content")
        val eps = episodes(doc, url)
        return if (eps.isEmpty()) newMovieLoadResponse(title, url, TvType.Movie, url) { posterUrl = poster; this.plot = plot }
        else newTvSeriesLoadResponse(title, url, TvType.Anime, eps) { posterUrl = poster; this.plot = plot }
    }

    private fun urlsInScripts(doc: Document) = doc.select("script").flatMap { sc ->
        Regex("""https?://[^"'\s<>]+""").findAll(sc.data()).map { it.value.replace("\\/", "/") }
            .filter { u -> Regex("""(?i)(embed|player|\.m3u8|\.mp4|/e/|/v/)""").containsMatchIn(u) }.toList()
    }.distinct()

    private fun servers(doc: Document): List<String> {
        val attrs = listOf("data-src", "data-url", "data-link", "data-embed", "data-watch", "data-server", "data-frame")
        val fromIframes = doc.select("iframe").map { f -> f.absUrl("src").ifBlank { f.absUrl("data-src") } }
        val fromButtons = doc.select(attrs.joinToString(",") { "[$it]" }).flatMap { e -> attrs.map { e.attr(it) } }.map { v -> if (v.startsWith("//")) "https:$v" else v }
        val fromLearned = Recipe.serverSelector?.let { sel ->
            if (sel == "script") urlsInScripts(doc)
            else doc.select(sel).map { e -> val v = e.attr(Recipe.serverAttr); if (v.startsWith("//")) "https:$v" else if (v.startsWith("/")) mainUrl + v else v }
        }.orEmpty()
        return (fromLearned + fromIframes + fromButtons).filter { it.startsWith("http") && (!same(it) || it.contains("embed") || it in fromLearned) }.distinct()
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        val doc = app.get(data).document
        var any = false
        servers(doc).forEach { src -> if (runCatching { loadExtractor(src, data, subtitleCallback, callback) }.getOrDefault(false)) any = true }
        return any
    }
}
