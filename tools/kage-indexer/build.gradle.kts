plugins {
    kotlin("jvm") version "2.4.0"
    application
}
// The providers' sources come from Abood's repository (checked out next to this folder by the workflow).
val provNames = (findProperty("sites") as String? ?: "5TV,Egy,Lodynet,Alooytv").split(',')
val sourceRoot = file(findProperty("sourceRoot") as String? ?: "../../re-3arabi")
kotlin {
    sourceSets["main"].kotlin.srcDirs(provNames.map { File(sourceRoot, "$it/src/main/kotlin") })
}
sourceSets["main"].kotlin.exclude("**/*Plugin.kt")
dependencies {
    implementation("com.github.recloudstream.cloudstream:library-jvm:master-SNAPSHOT")
    implementation("org.json:json:20240303")
    implementation("org.jsoup:jsoup:1.22.1")
    implementation("com.github.Blatzar:NiceHttp:0.4.18")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
    implementation("org.mozilla:rhino:1.8.0")
    implementation("org.jspecify:jspecify:1.0.0")
}
application { mainClass.set("kage.IndexerKt") }
tasks.named<CreateStartScripts>("startScripts") { classpath = files(tasks.jar) + configurations.runtimeClasspath.get() }
