<?php
$url = filter_var($_GET["url"], FILTER_SANITIZE_URL);
$script = file_get_contents($url);
echo $script;
?>