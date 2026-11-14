package kage

import com.lagradost.cloudstream3.AnimeLoadResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.MovieLoadResponse
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Kage's shared index, built on GitHub every day: opens every title a source shows (all its sections,
 * page after page) and keeps the page (seasons and episode pages, never the video links) in
 * index/<site>/<0..63>.json, the very format the app reads (PageCache in Kage).
 *
 * Args: <output folder (the ShaDo-sources checkout)> <sites, e.g. 5TV,Egy,Lodynet,Alooytv>
 */
private val classes = mapOf(
    "5TV" to "com.tv.FiveTVProvider",
    "Egy" to "com.egy.EgyWatchProvider",
    "Lodynet" to "com.lody.LodyNet",
    "Alooytv" to "com.alooy.AlooyTvProvider",
)

private const val SHARDS = 64
private const val FRESH_MS = 3L * 24 * 60 * 60 * 1000
private val deadline = System.currentTimeMillis() + (System.getenv("KAGE_MINUTES")?.toLongOrNull() ?: 300L) * 60_000

fun main(args: Array<String>) = runBlocking {
    val out = File(args.getOrNull(0) ?: ".")
    val sites = (args.getOrNull(1) ?: classes.keys.joinToString(",")).split(',').map { it.trim() }.filter { it.isNotEmpty() }
    val mirrors = runCatching { JSONObject(File(out, "knowledge/video/mirrors.json").readText()) }.getOrNull()
    for (site in sites) {
        val api = runCatching { Class.forName(classes.getValue(site)).getDeclaredConstructor().newInstance() as MainAPI }.getOrElse {
            println("[$site] cannot start: $it"); null
        } ?: continue
        runCatching { index(api, out, mirrors) }.onFailure { println("[$site] stopped: $it") }
        if (System.currentTimeMillis() > deadline) { println("time is up"); break }
    }
}

/** The site's name in the index, the same as Kage's SiteKey: "5tv" for 5TV and Mk5TV (addresses change, names do not). */
fun siteKey(name: String) = name.lowercase().replace(Regex("[^a-z0-9]"), "").removePrefix("mk").ifBlank { "site" }

fun pathOf(url: String) = url.substringAfter("://").substringAfter('/', "").trimEnd('/')

private suspend fun index(api: MainAPI, out: File, mirrors: JSONObject?) {
    val key = siteKey(api.name)
    val dir = File(out, "index/$key").apply { mkdirs() }
    println("[${api.name}] ${api.mainUrl} -> index/$key")
    val shards = (0 until SHARDS).associateWith { s ->
        val f = File(dir, "$s.json")
        val map = LinkedHashMap<String, JSONObject>()
        if (f.exists()) runCatching { JSONArray(f.readText()) }.getOrNull()?.let { arr -> (0 until arr.length()).forEach { i -> arr.getJSONObject(i).let { map[it.optString("u")] = it } } }
        map
    }

    // Every title the source shows, section after section, page after page.
    val titles = LinkedHashMap<String, SearchResponse>()
    for (section in api.mainPage) {
        var page = 1
        while (page <= 80 && System.currentTimeMillis() < deadline) {
            val list = withTimeoutOrNull(40_000) {
                runCatching { api.getMainPage(page, MainPageRequest(section.name, section.data, false))?.items?.flatMap { it.list } }.getOrNull()
            }.orEmpty()
            val before = titles.size
            list.forEach { titles.putIfAbsent(it.url, it) }
            if (list.isEmpty() || titles.size == before) break
            page++
        }
        println("[${api.name}] ${section.name}: ${titles.size} titles so far")
    }

    var done = 0
    var kept = 0
    val gate = Semaphore(3)
    coroutineScope {
        titles.values.map { r ->
            async {
                gate.withPermit {
                    if (System.currentTimeMillis() > deadline) return@withPermit
                    val path = pathOf(r.url)
                    val shard = shards.getValue(Math.floorMod(path.hashCode(), SHARDS))
                    val old = synchronized(shard) { shard[path] }
                    if (old != null && System.currentTimeMillis() - old.optLong("at") < FRESH_MS) return@withPermit
                    val page = withTimeoutOrNull(60_000) { runCatching { api.load(r.url) }.getOrNull() }
                    if (page != null) { synchronized(shard) { shard[path] = toJson(api, page, path) }; kept++ }
                    done++
                    if (done % 100 == 0) println("[${api.name}] $done/${titles.size} opened, $kept kept")
                    kotlinx.coroutines.delay(400)
                }
            }
        }.awaitAll()
    }
    shards.forEach { (s, map) -> if (map.isNotEmpty()) File(dir, "$s.json").writeText(JSONArray(map.values).toString()) }
    println("[${api.name}] done: ${titles.size} titles, $kept pages kept")
}

/** The entry, exactly as Kage's PageCache.toJson writes it. */
private fun toJson(api: MainAPI, page: LoadResponse, path: String): JSONObject {
    val base = api.mainUrl.trimEnd('/')
    fun rel(u: String) = if (u.startsWith(base)) "{base}" + u.removePrefix(base) else u
    val o = JSONObject().put("u", path).put("pu", pathOf(page.url)).put("n", page.name).put("t", page.type.name)
        .put("p", page.posterUrl).put("d", page.plot).put("y", page.year ?: JSONObject.NULL)
        .put("g", JSONArray(page.tags.orEmpty())).put("at", System.currentTimeMillis())
    when (page) {
        is MovieLoadResponse -> o.put("m", rel(page.dataUrl))
        else -> {
            val eps = JSONArray()
            val list = when (page) {
                is TvSeriesLoadResponse -> page.episodes
                is AnimeLoadResponse -> page.episodes.values.firstOrNull { it.isNotEmpty() }.orEmpty()
                else -> emptyList()
            }
            list.forEach { e -> eps.put(JSONArray().put(rel(e.data)).put(e.name ?: "").put(e.season ?: -1).put(e.episode ?: -1)) }
            o.put("e", eps)
        }
    }
    val recs = JSONArray()
    page.recommendations.orEmpty().forEach { r -> recs.put(JSONArray().put(r.name).put(rel(r.url)).put(r.posterUrl ?: "")) }
    o.put("r", recs)
    return o
}
