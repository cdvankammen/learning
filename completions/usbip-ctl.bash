#!/usr/bin/env bash

_usbip_ctl_commands=(
  status
  containers
  backups
  devices
  bind
  unbind
  network
  discover
  connect
  disconnect
  up
  down
  restart
  service
  virtual
  health
  prune
  backup
  test
  lint
  build
  serve
  logs
  install
  cron
  help
)

_usbip_ctl_service_actions=(
  status
  start
  stop
  restart
  enable
  disable
  install
  remove
)

_usbip_ctl_discover_actions=(
  status
  list
  announce
)

_usbip_ctl_discover_announce_actions=(
  status
  start
  stop
)

_usbip_ctl_virtual_actions=(
  status
  list
  start
  stop
  restart
)

_usbip_ctl_words() {
  local idx
  for idx in "${!COMP_WORDS[@]}"; do
    printf '%s\n' "${COMP_WORDS[$idx]}"
  done
}

_usbip_ctl_command_at() {
  local idx=1
  while [ "$idx" -lt "${#COMP_WORDS[@]}" ]; do
    case "${COMP_WORDS[$idx]}" in
      --json|--pretty)
        idx=$((idx + 1))
        ;;
      --format)
        idx=$((idx + 2))
        ;;
      -*)
        idx=$((idx + 1))
        ;;
      --)
        break
        ;;
      *)
        printf '%s' "${COMP_WORDS[$idx]}"
        return 0
        ;;
    esac
  done
  return 1
}

_usbip_ctl()
{
  local cur prev command
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD - 1]}"

  if [[ "$COMP_CWORD" -le 1 && "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "--json --pretty --format --help -h" -- "$cur") )
    return 0
  fi

  command="$(_usbip_ctl_command_at)"

  if [[ -z "$command" ]]; then
    COMPREPLY=( $(compgen -W "${_usbip_ctl_commands[*]}" -- "$cur") )
    return 0
  fi

  case "$command" in
    service)
      if [[ "$COMP_CWORD" -le 2 ]]; then
        COMPREPLY=( $(compgen -W "${_usbip_ctl_service_actions[*]}" -- "$cur") )
      fi
      ;;
    discover)
      if [[ "${COMP_WORDS[COMP_CWORD - 1]}" == "announce" ]]; then
        COMPREPLY=( $(compgen -W "${_usbip_ctl_discover_announce_actions[*]}" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "${_usbip_ctl_discover_actions[*]}" -- "$cur") )
      fi
      ;;
    virtual)
      COMPREPLY=( $(compgen -W "${_usbip_ctl_virtual_actions[*]}" -- "$cur") )
      ;;
    *)
      if [[ "$COMP_CWORD" -le 1 || "$prev" == "--" ]]; then
        COMPREPLY=( $(compgen -W "${_usbip_ctl_commands[*]}" -- "$cur") )
      fi
      ;;
  esac
}

complete -F _usbip_ctl usbip-ctl
