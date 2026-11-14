version = (findProperty("recipeVersion") as String? ?: "1").toInt()

cloudstream {
    description = "مصدر بُني من موقعه في Kage"
    authors = listOf("Youssef")
    language = "ar"
    status = 1
    tvTypes = listOf("TvSeries", "Movie", "Anime")
}

// Bakes the taught site's recipe (a small JSON) into the plugin as Recipe.kt.
val recipePath = findProperty("recipe") as String? ?: "$rootDir/sample-recipe.json"
val genDir = layout.buildDirectory.dir("generated/recipe")
val bakeRecipe = tasks.register("bakeRecipe") {
    val outFile = genDir.get().file("com/kage/site/Recipe.kt").asFile
    inputs.file(recipePath)
    outputs.file(outFile)
    doLast {
        val json = file(recipePath).readText().trim()
        // Keep it as a raw string the plugin parses at runtime; """ is escaped so it survives the literal.
        val safe = json.replace("\"\"\"", "\\\"\\\"\\\"").replace("\$", "\${'\$'}")
        outFile.parentFile.mkdirs()
        outFile.writeText(
            "package com.kage.site\n\n" +
            "import org.json.JSONObject\n\n" +
            "object Recipe {\n" +
            "    const val RECIPE_JSON = \"\"\"$safe\"\"\"\n" +
            "    private val o = JSONObject(RECIPE_JSON)\n" +
            "    val name: String get() = o.optString(\"name\", \"KageSite\")\n" +
            "    val mainUrl: String get() = o.optString(\"mainUrl\").trimEnd('/')\n" +
            "    val searchTemplate: String? get() = o.optString(\"searchTemplate\").takeIf { it.isNotBlank() }\n" +
            "    val searchPath: String get() = o.optString(\"searchPath\", \"/?s=\")\n" +
            "    val episodeHref: String? get() = o.optString(\"episodeHref\").takeIf { it.isNotBlank() }\n" +
            "    val episodeBox: String? get() = o.optString(\"episodeBox\").takeIf { it.isNotBlank() }\n" +
            "    val watchSuffix: String? get() = o.optString(\"watchSuffix\").takeIf { it.isNotBlank() }\n" +
            "    val serverSelector: String? get() = o.optString(\"serverSelector\").takeIf { it.isNotBlank() }\n" +
            "    val serverAttr: String get() = o.optString(\"serverAttr\", \"src\")\n" +
            "}\n"
        )
    }
}
tasks.matching { it.name.startsWith("compile") }.configureEach { dependsOn(bakeRecipe) }
android { sourceSets.getByName("main").java.srcDir(genDir) }
